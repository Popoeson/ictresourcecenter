const mongoose = require('mongoose');
const { Level } = require('../models');
const ExtraHandout = require('../models/ExtraHandout');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');
const fileService = require('../services/fileService');

// Extra handout PDFs: 10 MB, same limit as the ICT handout
const MAX_HANDOUT_BYTES = 10 * 1024 * 1024;
const ID_RX = /^[a-f\d]{24}$/i;

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function oid(v) {
  return new mongoose.Types.ObjectId(v);
}

function keyOf(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function escapeRx(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRow(h) {
  return {
    id: String(h._id),
    title: h.title,
    price: h.price,
    isActive: h.isActive,
    institutionId: String(h.institution._id || h.institution),
    institution: h.institution.name || '',
    departmentId: String(h.department._id || h.department),
    department: h.department.name || '',
    levelId: String(h.level._id || h.level),
    level: h.level.name || '',
    file: {
      originalName: (h.file && h.file.originalName) || 'handout.pdf',
      bytes: (h.file && h.file.bytes) || 0,
    },
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

function populated(query) {
  return query
    .populate('institution', 'name')
    .populate('department', 'name')
    .populate('level', 'name');
}

function parsePrice(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1) throw new AppError('Enter a price in kobo, as a whole number above zero.', 400, 'VALIDATION');
  return n;
}

function parseTitle(value) {
  const t = String(value || '').trim().replace(/\s+/g, ' ');
  if (!t) throw new AppError('Enter a title for the handout.', 400, 'VALIDATION');
  if (t.length > 120) throw new AppError('The title is too long (120 characters at most).', 400, 'VALIDATION');
  return t;
}

async function checkPdf(file) {
  if (!file) throw new AppError('Choose a PDF file to upload.', 400, 'NO_FILE');
  if (fileService.extensionOf(file.originalname) !== 'pdf') {
    throw new AppError('Handouts must be PDF files.', 400, 'FILE_TYPE');
  }
  const check = await fileService.validateFile(file, { maxBytes: MAX_HANDOUT_BYTES, allowedExtensions: ['pdf'] });
  if (!check.ok) throw new AppError(check.reason, 400, 'FILE_REJECTED');
  return check;
}

async function listExtraHandouts(req, res, next) {
  try {
    const q = req.query;
    const page = Math.max(1, parseInt(q.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 25));

    const filter = {};
    if (q.institution && ID_RX.test(q.institution)) filter.institution = oid(q.institution);
    if (q.department && ID_RX.test(q.department)) filter.department = oid(q.department);
    if (q.level && ID_RX.test(q.level)) filter.level = oid(q.level);
    if (q.status === 'active') filter.isActive = true;
    else if (q.status === 'inactive') filter.isActive = false;
    if (q.q && String(q.q).trim()) filter.title = new RegExp(escapeRx(String(q.q).trim().slice(0, 60)), 'i');

    const [items, total] = await Promise.all([
      populated(ExtraHandout.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit)).lean(),
      ExtraHandout.countDocuments(filter),
    ]);

    send(res, {
      items: items.map(toRow),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

// Super Admin: add a new handout (title, level, price in kobo, PDF)
async function createExtraHandout(req, res, next) {
  try {
    const body = req.body || {};
    const levelId = String(body.level || '');
    if (!ID_RX.test(levelId)) throw new AppError('Choose a level.', 400, 'VALIDATION');
    const title = parseTitle(body.title);
    const price = parsePrice(body.price);
    const check = await checkPdf(req.file);

    const level = await Level.findOne({ _id: levelId, isActive: true })
      .populate('institution', 'name isActive')
      .populate('department', 'name isActive');
    if (!level || !level.institution || !level.department || !level.institution.isActive || !level.department.isActive) {
      throw new AppError('That level was not found.', 404, 'NOT_FOUND');
    }

    const scope = { institution: level.institution._id, department: level.department._id, level: level._id };
    const titleKey = keyOf(title);

    const exists = await ExtraHandout.findOne({ ...scope, titleKey, isActive: true }).select('_id').lean();
    if (exists) {
      throw new AppError('A handout with this title already exists for this department and level.', 409, 'DUPLICATE');
    }

    const stored = await fileService.uploadBuffer({
      buffer: req.file.buffer,
      folder: fileService.handoutFolder(level.institution.name, level.department.name, level.name),
      extension: check.extension,
      resourceType: check.resourceType,
    });

    let created;
    try {
      created = await ExtraHandout.create({
        ...scope,
        title,
        titleKey,
        price,
        file: {
          publicId: stored.publicId,
          resourceType: stored.resourceType,
          deliveryType: stored.deliveryType,
          bytes: stored.bytes,
          originalName: String(req.file.originalname || 'handout.pdf').slice(0, 200),
        },
        isActive: true,
        uploadedBy: req.admin._id,
      });
    } catch (err) {
      await fileService.destroy(stored.publicId, stored.resourceType);
      if (err && err.code === 11000) {
        throw new AppError('A handout with this title already exists for this department and level.', 409, 'DUPLICATE');
      }
      throw err;
    }

    await auditService.log(req, {
      action: 'handout.extra_create',
      entityType: 'extraHandout',
      entityId: created._id,
      before: null,
      after: {
        title,
        price,
        institution: level.institution.name,
        department: level.department.name,
        level: level.name,
        originalName: created.file.originalName,
      },
    });

    const row = await populated(ExtraHandout.findById(created._id)).lean();
    send(res, toRow(row), 201);
  } catch (err) {
    next(err);
  }
}

// Super Admin: change the title, the price, or switch a handout off and on
async function updateExtraHandout(req, res, next) {
  try {
    const id = String(req.params.id || '');
    if (!ID_RX.test(id)) throw new AppError('Handout not found.', 404, 'NOT_FOUND');

    const doc = await ExtraHandout.findById(id);
    if (!doc) throw new AppError('Handout not found.', 404, 'NOT_FOUND');

    const before = { title: doc.title, price: doc.price, isActive: doc.isActive };
    const body = req.body || {};

    if (body.title !== undefined) {
      doc.title = parseTitle(body.title);
      doc.titleKey = keyOf(doc.title);
    }
    if (body.price !== undefined) doc.price = parsePrice(body.price);
    if (body.isActive !== undefined) doc.isActive = !!body.isActive;

    try {
      await doc.save();
    } catch (err) {
      if (err && err.code === 11000) {
        throw new AppError('A handout with this title already exists for this department and level.', 409, 'DUPLICATE');
      }
      throw err;
    }

    await auditService.log(req, {
      action: 'handout.extra_update',
      entityType: 'extraHandout',
      entityId: doc._id,
      before,
      after: { title: doc.title, price: doc.price, isActive: doc.isActive },
    });

    const row = await populated(ExtraHandout.findById(doc._id)).lean();
    send(res, toRow(row));
  } catch (err) {
    next(err);
  }
}

// Super Admin: replace the PDF of an existing handout
async function replaceExtraHandoutFile(req, res, next) {
  try {
    const id = String(req.params.id || '');
    if (!ID_RX.test(id)) throw new AppError('Handout not found.', 404, 'NOT_FOUND');
    const check = await checkPdf(req.file);

    const doc = await populated(ExtraHandout.findById(id));
    if (!doc) throw new AppError('Handout not found.', 404, 'NOT_FOUND');

    const stored = await fileService.uploadBuffer({
      buffer: req.file.buffer,
      folder: fileService.handoutFolder(doc.institution.name, doc.department.name, doc.level.name),
      extension: check.extension,
      resourceType: check.resourceType,
    });

    const old = doc.file ? { publicId: doc.file.publicId, resourceType: doc.file.resourceType, originalName: doc.file.originalName, bytes: doc.file.bytes } : null;

    try {
      doc.file = {
        publicId: stored.publicId,
        resourceType: stored.resourceType,
        deliveryType: stored.deliveryType,
        bytes: stored.bytes,
        originalName: String(req.file.originalname || 'handout.pdf').slice(0, 200),
      };
      await doc.save();
    } catch (err) {
      await fileService.destroy(stored.publicId, stored.resourceType);
      throw err;
    }

    if (old) await fileService.destroy(old.publicId, old.resourceType);

    await auditService.log(req, {
      action: 'handout.extra_replace_file',
      entityType: 'extraHandout',
      entityId: doc._id,
      before: old ? { originalName: old.originalName, bytes: old.bytes } : null,
      after: { originalName: doc.file.originalName, bytes: doc.file.bytes, title: doc.title },
    });

    send(res, toRow(doc.toObject()));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listExtraHandouts,
  createExtraHandout,
  updateExtraHandout,
  replaceExtraHandoutFile,
  MAX_HANDOUT_BYTES,
};