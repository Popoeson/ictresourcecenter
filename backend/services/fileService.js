const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const FileType = require('file-type');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { AppError } = require('../middleware/errorHandler');

// File checks and private Cloudinary storage. Files are never public: every asset is "authenticated".

// For each allowed extension: which content types are accepted, and how Cloudinary stores it.
// The content check reads the file's real signature, so renaming a file does not get it through.
const RULES = {
  pdf: { kinds: ['pdf'], resource: 'raw' },
  doc: { kinds: ['cfb'], resource: 'raw' },
  docx: { kinds: ['docx', 'zip'], resource: 'raw' },
  xls: { kinds: ['cfb'], resource: 'raw' },
  xlsx: { kinds: ['xlsx', 'zip'], resource: 'raw' },
  ppt: { kinds: ['cfb'], resource: 'raw' },
  pptx: { kinds: ['pptx', 'zip'], resource: 'raw' },
  jpg: { kinds: ['jpg'], resource: 'image' },
  jpeg: { kinds: ['jpg'], resource: 'image' },
  png: { kinds: ['png'], resource: 'image' },
  webp: { kinds: ['webp'], resource: 'image' },
};

const TYPE_MESSAGE = 'This file type is not allowed. Use PDF, Word, Excel, PowerPoint, or an image.';

let configured = false;
function client() {
  if (!env.cloudinaryCloudName || !env.cloudinaryApiKey || !env.cloudinaryApiSecret) {
    throw new AppError('File storage is not available right now. Please try again later.', 503, 'STORAGE_UNAVAILABLE');
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.cloudinaryCloudName,
      api_key: env.cloudinaryApiKey,
      api_secret: env.cloudinaryApiSecret,
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

function extensionOf(name) {
  const m = /\.([A-Za-z0-9]+)$/.exec(String(name || ''));
  return m ? m[1].toLowerCase() : '';
}

// file: a multer file (originalname, buffer, size). opts: { maxBytes, allowedExtensions }
// Returns { ok: true, extension, resourceType } or { ok: false, reason } with a message the student can read.
async function validateFile(file, opts) {
  const maxBytes = (opts && opts.maxBytes) || 5 * 1024 * 1024;
  const allowed = (opts && opts.allowedExtensions) || Object.keys(RULES);
  const ext = extensionOf(file.originalname);

  if (!file.buffer || file.size === 0) return { ok: false, reason: 'This file is empty.' };
  if (file.size > maxBytes) {
    return { ok: false, reason: 'This file is larger than ' + Math.round(maxBytes / (1024 * 1024)) + ' MB.' };
  }
  if (!ext || !RULES[ext] || !allowed.includes(ext)) return { ok: false, reason: TYPE_MESSAGE };

  let detected = null;
  try {
    detected = await FileType.fromBuffer(file.buffer);
  } catch (e) {
    detected = null;
  }
  if (!detected || !RULES[ext].kinds.includes(detected.ext)) {
    return { ok: false, reason: 'This file does not match its type. Use a real PDF, Word, Excel, PowerPoint, or image file.' };
  }
  return { ok: true, extension: ext, resourceType: RULES[ext].resource };
}

function slug(text) {
  const s = String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return s || 'unknown';
}

// ict/assignments/{institution}/{level}
function assignmentFolder(institutionName, levelName) {
  return 'ict/assignments/' + slug(institutionName) + '/' + slug(levelName);
}

// ict/handouts/{institution}/{department}/{level}
function handoutFolder(institutionName, departmentName, levelName) {
  return 'ict/handouts/' + slug(institutionName) + '/' + slug(departmentName) + '/' + slug(levelName);
}

// Stores one file privately under a random name. Returns the details to save on the submission.
async function uploadBuffer({ buffer, folder, extension, resourceType }) {
  const c = client();
  const name = crypto.randomBytes(12).toString('hex');
  const isImage = resourceType === 'image';
  const options = {
    resource_type: resourceType,
    type: 'authenticated',
    public_id: folder + '/' + name + (isImage ? '' : '.' + extension),
    overwrite: false,
  };

  try {
    const res = await new Promise((resolve, reject) => {
      const stream = c.uploader.upload_stream(options, (err, result) => (err ? reject(err) : resolve(result)));
      stream.end(buffer);
    });
    return {
      publicId: res.public_id,
      resourceType: res.resource_type,
      deliveryType: res.type,
      format: res.format || extension,
      bytes: res.bytes,
    };
  } catch (err) {
    logger.error({ err: err.message, http: err.http_code }, 'Cloudinary upload failed');
    throw new AppError('Could not store the file. Please try again.', 502, 'STORAGE_ERROR');
  }
}

// Removes a stored file (used to clean up when an upload fails part way). Never throws.
async function destroy(publicId, resourceType) {
  try {
    await client().uploader.destroy(publicId, { resource_type: resourceType, type: 'authenticated', invalidate: true });
  } catch (err) {
    logger.warn({ publicId, err: err.message }, 'Could not remove a stored file');
  }
}

module.exports = { validateFile, uploadBuffer, destroy, assignmentFolder, handoutFolder, extensionOf, RULES };