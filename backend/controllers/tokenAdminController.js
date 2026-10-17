const mongoose = require('mongoose');
const { Token, Student } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');
const tokenService = require('../services/tokenService');
const { normKey } = require('../services/normalize');

const STATUSES = ['active', 'in_progress', 'used', 'expired', 'revoked'];
const SOURCES = ['payment', 'manual', 'reissue'];

const POPULATE = [
  {
    path: 'student',
    select: 'surname firstname othername institution department level',
    populate: [
      { path: 'institution', select: 'name' },
      { path: 'department', select: 'name' },
      { path: 'level', select: 'name' },
    ],
  },
  { path: 'payment', select: 'reference receiptNumber' },
  { path: 'createdBy', select: 'name' },
];

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A token that is still "active" but past its time is shown as expired
function effectiveStatus(t, now) {
  if (t.status === 'active' && t.expiresAt <= now) return 'expired';
  return t.status;
}

function studentName(s) {
  return s ? [s.surname, s.firstname, s.othername].filter(Boolean).join(' ') : '';
}

function toRow(t, now) {
  const status = effectiveStatus(t, now);
  const s = t.student;
  return {
    id: String(t._id),
    code: t.code,
    status,
    source: t.source,
    studentId: s ? String(s._id) : null,
    studentName: studentName(s),
    institution: s && s.institution ? s.institution.name : '',
    department: s && s.department ? s.department.name : '',
    level: s && s.level ? s.level.name : '',
    filesAllowed: t.filesAllowed,
    filesUploaded: t.filesUploaded,
    expiresAt: t.expiresAt,
    claimedAt: t.claimedAt,
    usedAt: t.usedAt,
    createdAt: t.createdAt,
    paymentReference: t.payment ? t.payment.reference : null,
    createdByName: t.createdBy ? t.createdBy.name : null,
    canReissue: status === 'active' || status === 'expired',
  };
}

async function loadRow(id) {
  const doc = await Token.findById(id).populate(POPULATE);
  return toRow(doc, new Date());
}

async function buildFilter(q, now) {
  const and = [];

  if (q.status && STATUSES.includes(q.status)) {
    if (q.status === 'active') {
      and.push({ status: 'active', expiresAt: { $gt: now } });
    } else if (q.status === 'expired') {
      and.push({ $or: [{ status: 'expired' }, { status: 'active', expiresAt: { $lte: now } }] });
    } else {
      and.push({ status: q.status });
    }
  }
  if (q.source && SOURCES.includes(q.source)) and.push({ source: q.source });

  // Dates are treated as Nigerian local days (UTC+1)
  if (q.from || q.to) {
    const range = {};
    if (q.from) range.$gte = new Date(q.from + 'T00:00:00+01:00');
    if (q.to) range.$lte = new Date(q.to + 'T23:59:59.999+01:00');
    and.push({ createdAt: range });
  }

  const text = q.q ? String(q.q).trim() : '';
  if (text) {
    const or = [];

    const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw) {
      const body = raw.startsWith('ICT') ? raw.slice(3) : raw;
      or.push({ code: { $regex: '^ICT-' + escapeRegex(body) } });
    }

    const words = normKey(text).split(' ').filter(Boolean).slice(0, 5);
    if (words.length) {
      const students = await Student.find({
        $and: words.map((w) => ({ searchTokens: { $regex: '^' + escapeRegex(w) } })),
      })
        .select('_id')
        .limit(300)
        .lean();
      if (students.length) or.push({ student: { $in: students.map((s) => s._id) } });
    }

    and.push(or.length ? { $or: or } : { _id: { $in: [] } });
  }

  return and.length ? { $and: and } : {};
}

async function list(req, res, next) {
  try {
    const now = new Date();
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = await buildFilter(req.query, now);

    const [docs, total] = await Promise.all([
      Token.find(filter)
        .populate(POPULATE)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Token.countDocuments(filter),
    ]);

    send(res, {
      items: docs.map((t) => toRow(t, now)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    next(err);
  }
}

// Super Admin: replace a token that has not been used with a fresh one
async function reissue(req, res, next) {
  try {
    const old = await Token.findById(req.params.id);
    if (!old) throw new AppError('Token not found.', 404, 'NOT_FOUND');
    if (old.status === 'used') {
      throw new AppError('This token has already been used, so it cannot be reissued.', 409, 'TOKEN_USED');
    }
    if (old.status === 'in_progress') {
      throw new AppError('This token is being used right now. Try again in a moment.', 409, 'TOKEN_BUSY');
    }
    if (old.status === 'revoked') {
      throw new AppError('This token was already replaced.', 409, 'TOKEN_REVOKED');
    }

    // Only one request can revoke it, so a double click cannot create two new tokens
    const revoked = await Token.findOneAndUpdate(
      { _id: old._id, status: { $in: ['active', 'expired'] } },
      { $set: { status: 'revoked' } },
      { new: false }
    );
    if (!revoked) {
      throw new AppError('This token changed just now. Reload the page and try again.', 409, 'TOKEN_CHANGED');
    }

    let fresh;
    try {
      fresh = await tokenService.createToken({
        student: old.student,
        payment: null,
        source: 'reissue',
        filesAllowed: old.filesAllowed,
        createdBy: req.admin._id,
        reissuedFrom: old._id,
      });
    } catch (err) {
      // Put the old token back so the student is not left with nothing
      await Token.updateOne({ _id: old._id, status: 'revoked' }, { $set: { status: revoked.status } });
      throw err;
    }

    await auditService.log(req, {
      action: 'token.reissue',
      entityType: 'token',
      entityId: fresh._id,
      before: { code: old.code, status: revoked.status },
      after: { code: fresh.code, status: fresh.status, filesAllowed: fresh.filesAllowed, reissuedFrom: String(old._id) },
    });

    const row = await loadRow(fresh._id);
    send(res, { ...row, previousCode: old.code }, 201);
  } catch (err) {
    next(err);
  }
}

// Super Admin: a token that is not tied to any payment
async function createManual(req, res, next) {
  try {
    const student = await Student.findOne({ _id: req.body.studentId, isDeleted: false }).select('_id');
    if (!student) throw new AppError('Student not found.', 404, 'NOT_FOUND');

    const token = await tokenService.createToken({
      student: student._id,
      payment: null,
      source: 'manual',
      filesAllowed: req.body.files,
      createdBy: req.admin._id,
    });

    await auditService.log(req, {
      action: 'token.manual_create',
      entityType: 'token',
      entityId: token._id,
      after: { code: token.code, student: String(student._id), filesAllowed: token.filesAllowed },
    });

    send(res, await loadRow(token._id), 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, reissue, createManual };