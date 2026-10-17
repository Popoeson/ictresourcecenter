const mongoose = require('mongoose');
const { Level, HandoutFile, Setting } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');
const fileService = require('../services/fileService');

// Handout PDFs: 10 MB (Cloudinary free plan limit for one file)
const MAX_HANDOUT_BYTES = 10 * 1024 * 1024;
const ID_RX = /^[a-f\d]{24}$/i;

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function oid(v) {
  return new mongoose.Types.ObjectId(v);
}

function cmp(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

// One row per institution, department and level, with its active PDF if there is one
function toRow(level, file) {
  return {
    levelId: String(level._id),
    institutionId: String(level.institution._id),
    institution: level.institution.name,
    departmentId: String(level.department._id),
    department: level.department.name,
    level: level.name,
    file: file
      ? {
          id: String(file._id),
          originalName: (file.file && file.file.originalName) || 'handout.pdf',
          bytes: (file.file && file.file.bytes) || 0,
          uploadedAt: file.createdAt,
        }
      : null,
  };
}

async function getSettings(req, res, next) {
  try {
    const s = await Setting.findOne({ key: 'global' }).select('handoutDeliveryMode').lean();
    send(res, { deliveryMode: (s && s.handoutDeliveryMode) || 'hybrid' });
  } catch (err) {
    next(err);
  }
}

async function updateSettings(req, res, next) {
  try {
    const mode = req.body.deliveryMode;
    const current = await Setting.findOne({ key: 'global' }).select('handoutDeliveryMode').lean();
    const previous = (current && current.handoutDeliveryMode) || 'hybrid';

    await Setting.updateOne(
      { key: 'global' },
      { $set: { handoutDeliveryMode: mode } },
      { upsert: true, setDefaultsOnInsert: true }
    );

    await auditService.log(req, {
      action: 'handout.mode_update',
      entityType: 'settings',
      before: { deliveryMode: previous },
      after: { deliveryMode: mode },
    });
    send(res, { deliveryMode: mode });
  } catch (err) {
    next(err);
  }
}

async function listFiles(req, res, next) {
  try {
    const q = req.query;
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25));

    const scope = {};
    if (q.institution && ID_RX.test(q.institution)) scope.institution = oid(q.institution);
    if (q.department && ID_RX.test(q.department)) scope.department = oid(q.department);

    const [levels, files] = await Promise.all([
      Level.find({ ...scope, isActive: true })
        .select('name institution department')
        .populate('institution', 'name isActive')
        .populate('department', 'name isActive')
        .lean(),
      HandoutFile.find({ ...scope, isActive: true }).select('level file createdAt').lean(),
    ]);

    const byLevel = {};
    files.forEach((f) => {
      byLevel[String(f.level)] = f;
    });

    let rows = levels
      .filter((l) => l.institution && l.department && l.institution.isActive && l.department.isActive)
      .map((l) => toRow(l, byLevel[String(l._id)]));

    rows.sort((a, b) => cmp(a.institution, b.institution) || cmp(a.department, b.department) || cmp(a.level, b.level));

    // The summary ignores the status filter, like the Payments totals
    const summary = { total: rows.length, uploaded: rows.filter((r) => r.file).length };

    if (q.status === 'uploaded') rows = rows.filter((r) => r.file);
    else if (q.status === 'missing') rows = rows.filter((r) => !r.file);

    const total = rows.length;
    send(res, {
      items: rows.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary,
    });
  } catch (err) {
    next(err);
  }
}

// Super Admin: upload a PDF for a level, or replace the one that is there
async function upload(req, res, next) {
  try {
    const levelId = String((req.body && req.body.level) || '');
    if (!ID_RX.test(levelId)) throw new AppError('Choose a level.', 400, 'VALIDATION');

    const file = req.file;
    if (!file) throw new AppError('Choose a PDF file to upload.', 400, 'NO_FILE');

    const level = await Level.findOne({ _id: levelId, isActive: true })
      .populate('institution', 'name isActive')
      .populate('department', 'name isActive');
    if (!level || !level.institution || !level.department || !level.institution.isActive || !level.department.isActive) {
      throw new AppError('That level was not found.', 404, 'NOT_FOUND');
    }

    if (fileService.extensionOf(file.originalname) !== 'pdf') {
      throw new AppError('Handouts must be PDF files.', 400, 'FILE_TYPE');
    }
    const check = await fileService.validateFile(file, { maxBytes: MAX_HANDOUT_BYTES, allowedExtensions: ['pdf'] });
    if (!check.ok) throw new AppError(check.reason, 400, 'FILE_REJECTED');

    const stored = await fileService.uploadBuffer({
      buffer: file.buffer,
      folder: fileService.handoutFolder(level.institution.name, level.department.name, level.name),
      extension: check.extension,
      resourceType: check.resourceType,
    });

    const scope = { institution: level.institution._id, department: level.department._id, level: level._id };

    // The old PDF stays as an inactive record. Only one PDF can be active per combination.
    const old = await HandoutFile.findOneAndUpdate(
      { ...scope, isActive: true },
      { $set: { isActive: false, replacedAt: new Date() } },
      { new: false }
    );

    let created;
    try {
      created = await HandoutFile.create({
        ...scope,
        file: {
          publicId: stored.publicId,
          resourceType: stored.resourceType,
          deliveryType: stored.deliveryType,
          bytes: stored.bytes,
          originalName: String(file.originalname || 'handout.pdf').slice(0, 200),
        },
        isActive: true,
        uploadedBy: req.admin._id,
      });
    } catch (err) {
      await fileService.destroy(stored.publicId, stored.resourceType);
      if (old) {
        try {
          await HandoutFile.updateOne({ _id: old._id }, { $set: { isActive: true, replacedAt: null } });
        } catch (e) {
          // Another upload already took its place. Nothing to restore.
        }
      }
      if (err && err.code === 11000) {
        throw new AppError('Another upload just finished for this level. Reload the page and try again.', 409, 'CONFLICT');
      }
      throw err;
    }

    await auditService.log(req, {
      action: 'handout.upload',
      entityType: 'handoutFile',
      entityId: created._id,
      before: old ? { originalName: old.file.originalName, bytes: old.file.bytes } : null,
      after: {
        originalName: created.file.originalName,
        bytes: created.file.bytes,
        institution: level.institution.name,
        department: level.department.name,
        level: level.name,
        replaced: !!old,
      },
    });

    send(res, { ...toRow(level, created), replaced: !!old }, 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings, listFiles, upload, MAX_HANDOUT_BYTES };