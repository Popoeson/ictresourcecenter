const mongoose = require('mongoose');
const axios = require('axios');
const archiver = require('archiver');

const { Submission, Student } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');
const fileService = require('../services/fileService');
const { normKey } = require('../services/normalize');
const logger = require('../config/logger');

const ID_RX = /^[a-f\d]{24}$/i;

const POPULATE = [
  { path: 'student', select: 'surname firstname othername' },
  { path: 'institution', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'level', select: 'name' },
];

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function studentName(s) {
  return s ? [s.surname, s.firstname, s.othername].filter(Boolean).join(' ') : '';
}

// Token details are never part of a row, so the Admin role cannot see manual or reissued tokens
function toRow(s) {
  const f = s.file || {};
  return {
    id: String(s._id),
    uploadedAt: s.uploadedAt || s.createdAt,
    studentId: s.student ? String(s.student._id) : null,
    studentName: studentName(s.student),
    institution: s.institution ? s.institution.name : '',
    department: s.department ? s.department.name : '',
    level: s.level ? s.level.name : '',
    fileName: f.originalName || 'file',
    extension: f.extension || f.format || '',
    bytes: f.bytes || 0,
  };
}

async function buildFilter(q) {
  const f = { isDeleted: false };

  ['institution', 'department', 'level'].forEach((k) => {
    if (q[k] && ID_RX.test(q[k])) f[k] = new mongoose.Types.ObjectId(q[k]);
  });

  // Dates are treated as Nigerian local days (UTC+1)
  if (q.from || q.to) {
    f.uploadedAt = {};
    if (q.from) f.uploadedAt.$gte = new Date(q.from + 'T00:00:00+01:00');
    if (q.to) f.uploadedAt.$lte = new Date(q.to + 'T23:59:59.999+01:00');
  }

  const text = q.q ? String(q.q).trim() : '';
  if (text) {
    const words = normKey(text).split(' ').filter(Boolean).slice(0, 5);
    const students = await Student.find({
      $and: words.map((w) => ({ searchTokens: { $regex: '^' + escapeRegex(w) } })),
    })
      .select('_id')
      .limit(500)
      .lean();
    f.student = { $in: students.map((s) => s._id) };
  }
  return f;
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = await buildFilter(req.query);

    const [docs, total] = await Promise.all([
      Submission.find(filter)
        .populate(POPULATE)
        .sort({ uploadedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Submission.countDocuments(filter),
    ]);

    send(res, {
      items: docs.map(toRow),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

function safeName(text) {
  return String(text || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function disposition(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, '');
  const encoded = encodeURIComponent(name).replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
  return 'attachment; filename="' + ascii + '"; filename*=UTF-8\'\'' + encoded;
}

// Streams one stored file with a readable name. The Cloudinary link is made here and never leaves the server.
async function download(req, res, next) {
  try {
    const s = await Submission.findOne({ _id: req.params.id, isDeleted: false }).populate({
      path: 'student',
      select: 'surname firstname othername',
    });
    if (!s) throw new AppError('Submission not found.', 404, 'NOT_FOUND');

    const f = s.file;
    const url = fileService.signedDownloadUrl({
      publicId: f.publicId,
      resourceType: f.resourceType,
      format: f.format || f.extension,
      ttlSeconds: 120,
    });

    let upstream;
    try {
      upstream = await axios.get(url, { responseType: 'stream', timeout: 30000 });
    } catch (err) {
      if (err.response && err.response.data && typeof err.response.data.destroy === 'function') err.response.data.destroy();
      logger.error({ id: String(s._id), status: err.response && err.response.status }, 'Submission download failed');
      throw new AppError('Could not fetch the file right now. Please try again.', 502, 'STORAGE_ERROR');
    }

    const original = safeName(f.originalName) || 'file' + (f.extension ? '.' + f.extension : '');
    const who = safeName(studentName(s.student));
    const name = (who ? who + ' - ' : '') + original;

    res.setHeader('Content-Type', f.mimeType || upstream.headers['content-type'] || 'application/octet-stream');
    if (upstream.headers['content-length']) res.setHeader('Content-Length', upstream.headers['content-length']);
    res.setHeader('Content-Disposition', disposition(name.slice(0, 180)));
    res.setHeader('Cache-Control', 'no-store');

    upstream.data.on('error', () => res.destroy());
    res.on('close', () => upstream.data.destroy());
    upstream.data.pipe(res);
  } catch (err) {
    next(err);
  }
}

// Super Admin: hide a submission. The record and the stored file are kept.
async function remove(req, res, next) {
  try {
    const s = await Submission.findOneAndUpdate(
      { _id: req.params.id, isDeleted: false },
      { $set: { isDeleted: true } },
      { new: false }
    );
    if (!s) throw new AppError('Submission not found.', 404, 'NOT_FOUND');

    await auditService.log(req, {
      action: 'submission.delete',
      entityType: 'submission',
      entityId: s._id,
      before: { student: String(s.student), fileName: s.file && s.file.originalName, isDeleted: false },
      after: { isDeleted: true },
    });
    send(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

/* ---------- Bulk ZIP ---------- */

const MAX_ZIP_FILES = 100;

// Either a list of selected ids, or the same filters as the list
async function zipFilter(q) {
  const raw = q.ids ? String(q.ids).split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (raw.length) {
    if (raw.length > MAX_ZIP_FILES) {
      throw new AppError('Select ' + MAX_ZIP_FILES + ' files or fewer.', 400, 'ZIP_TOO_LARGE');
    }
    if (raw.some((id) => !ID_RX.test(id))) throw new AppError('Invalid selection.', 400, 'VALIDATION');
    return { _id: { $in: raw.map((id) => new mongoose.Types.ObjectId(id)) }, isDeleted: false };
  }
  return buildFilter(q);
}

// Lets the page show a message before the download starts
async function zipCheck(req, res, next) {
  try {
    const count = await Submission.countDocuments(await zipFilter(req.query));
    send(res, { count, max: MAX_ZIP_FILES, tooMany: count > MAX_ZIP_FILES });
  } catch (err) {
    next(err);
  }
}

// Institution/Level/Student - original name, with (2), (3)... for repeated names
function zipPath(s, used) {
  const f = s.file || {};
  const inst = safeName(s.institution && s.institution.name).slice(0, 60) || 'Institution';
  const lvl = safeName(s.level && s.level.name).slice(0, 60) || 'Level';
  const who = safeName(studentName(s.student)).slice(0, 60);
  let original = safeName(f.originalName) || 'file' + (f.extension ? '.' + f.extension : '');
  if (original.length > 90) original = original.slice(-90);
  const base = (who ? who + ' - ' : '') + original;
  const dir = inst + '/' + lvl;

  let path = dir + '/' + base;
  let n = 2;
  while (used.has(path.toLowerCase())) {
    const dot = base.lastIndexOf('.');
    const stem = dot > 0 ? base.slice(0, dot) : base;
    const ext = dot > 0 ? base.slice(dot) : '';
    path = dir + '/' + stem + ' (' + n + ')' + ext;
    n += 1;
  }
  used.add(path.toLowerCase());
  return path;
}

// Resolves when the archive has finished adding the entry (or has failed)
function waitEntry(archive) {
  return new Promise((resolve) => {
    const finish = () => {
      archive.removeListener('entry', finish);
      archive.removeListener('error', finish);
      resolve();
    };
    archive.once('entry', finish);
    archive.once('error', finish);
  });
}

// Streams a ZIP, one file at a time, so memory stays small on the free plan
async function zip(req, res, next) {
  try {
    const filter = await zipFilter(req.query);
    const docs = await Submission.find(filter)
      .populate(POPULATE)
      .sort({ uploadedAt: 1, _id: 1 })
      .limit(MAX_ZIP_FILES + 1);

    if (!docs.length) throw new AppError('There are no files to download for this filter.', 404, 'NO_FILES');
    if (docs.length > MAX_ZIP_FILES) {
      throw new AppError('More than ' + MAX_ZIP_FILES + ' files match. Narrow the filter and try again.', 400, 'ZIP_TOO_LARGE');
    }

    const archive = archiver('zip', { store: true });
    let aborted = false;
    let current = null;

    res.on('close', () => {
      if (!res.writableFinished) {
        aborted = true;
        archive.abort();
        if (current) current.destroy();
      }
    });
    archive.on('error', (err) => {
      logger.error({ err: err.message }, 'ZIP failed');
      res.destroy();
    });
    archive.on('warning', (err) => logger.warn({ err: err.message }, 'ZIP warning'));

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', disposition('submissions-' + new Date().toISOString().slice(0, 10) + '.zip'));
    res.setHeader('Cache-Control', 'no-store');
    archive.pipe(res);

    const used = new Set();
    const missing = [];

    for (const s of docs) {
      if (aborted) return;
      const f = s.file;
      const name = zipPath(s, used);

      let upstream;
      try {
        const url = fileService.signedDownloadUrl({
          publicId: f.publicId,
          resourceType: f.resourceType,
          format: f.format || f.extension,
          ttlSeconds: 300,
        });
        upstream = await axios.get(url, { responseType: 'stream', timeout: 30000 });
      } catch (err) {
        if (err.response && err.response.data && typeof err.response.data.destroy === 'function') {
          err.response.data.destroy();
        }
        logger.warn({ id: String(s._id) }, 'File could not be added to the ZIP');
        missing.push(name);
        continue;
      }

      current = upstream.data;
      const added = waitEntry(archive);
      archive.append(upstream.data, { name });
      await added;
      current = null;
    }

    if (aborted) return;
    if (missing.length) {
      archive.append(
        'These files could not be fetched and are not in this ZIP:\r\n\r\n' + missing.join('\r\n') + '\r\n',
        { name: 'NOT INCLUDED.txt' }
      );
    }
    await archive.finalize();
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    next(err);
  }
}

module.exports = { list, download, remove, zipCheck, zip, buildFilter, toRow, POPULATE };