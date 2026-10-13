const { Student, Level } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { normKey, phoneKey } = require('../services/normalize');
const auditService = require('../services/auditService');

const HIDDEN = '-searchTokens -emailKey -phoneKey';
const POPULATE = [
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

// q: an email (has @), a phone number (digits only), or name words
function buildFilter(query) {
  const filter = { isDeleted: false };
  ['institution', 'department', 'level'].forEach((k) => {
    if (query[k]) filter[k] = query[k];
  });
  if (query.levelKey) filter.levelKey = normKey(query.levelKey);
  if (query.ictFeePaid) filter.ictFeePaid = query.ictFeePaid === 'true';

  if (query.q) {
    const q = query.q.trim();
    if (q.includes('@')) {
      filter.emailKey = { $regex: '^' + escapeRegex(normKey(q)) };
    } else if (/^\d+$/.test(q)) {
      filter.phoneKey = { $regex: '^' + escapeRegex(q) };
    } else {
      filter.$and = normKey(q)
        .split(' ')
        .filter(Boolean)
        .map((w) => ({ searchTokens: { $regex: '^' + escapeRegex(w) } }));
    }
  }
  return filter;
}

async function listStudents(req, res, next) {
  try {
    const { page, limit } = req.query;
    const filter = buildFilter(req.query);
    const [items, total] = await Promise.all([
      Student.find(filter)
        .select(HIDDEN)
        .populate(POPULATE)
        .sort({ surname: 1, firstname: 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Student.countDocuments(filter),
    ]);
    send(res, { items, page, limit, total, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
}

async function getStudent(req, res, next) {
  try {
    const doc = await Student.findOne({ _id: req.params.id, isDeleted: false })
      .select(HIDDEN)
      .populate(POPULATE);
    if (!doc) throw new AppError('Student not found.', 404, 'NOT_FOUND');
    send(res, doc);
  } catch (err) {
    next(err);
  }
}

async function createStudent(req, res, next) {
  try {
    const b = req.body;
    const level = await Level.findById(b.level);
    if (!level) throw new AppError('Level not found.', 404, 'NOT_FOUND');

    // Same rule as the import: phone is only used for duplicates when there is no email
    if (!b.email && b.phone) {
      const pk = phoneKey(b.phone);
      if (pk && (await Student.exists({ phoneKey: pk, isDeleted: false }))) {
        throw new AppError('A student with this phone number already exists.', 409, 'DUPLICATE');
      }
    }

    const doc = await Student.create({
      surname: b.surname,
      firstname: b.firstname,
      othername: b.othername || '',
      phone: b.phone || '',
      email: b.email || '',
      institution: level.institution,
      department: level.department,
      level: level._id,
      levelKey: level.levelKey,
      source: 'manual',
    });

    await auditService.log(req, {
      action: 'student.create', entityType: 'student', entityId: doc._id, after: doc,
    });
    const fresh = await Student.findById(doc._id).select(HIDDEN).populate(POPULATE);
    send(res, fresh, 201);
  } catch (err) {
    next(err);
  }
}

async function updateStudent(req, res, next) {
  try {
    const doc = await Student.findOne({ _id: req.params.id, isDeleted: false });
    if (!doc) throw new AppError('Student not found.', 404, 'NOT_FOUND');
    const before = doc.toObject();
    const b = req.body;

    ['surname', 'firstname', 'othername', 'phone', 'email'].forEach((f) => {
      if (b[f] !== undefined) doc[f] = b[f];
    });

    if (b.level !== undefined) {
      const level = await Level.findById(b.level);
      if (!level) throw new AppError('Level not found.', 404, 'NOT_FOUND');
      doc.level = level._id;
      doc.department = level.department;
      doc.institution = level.institution;
      doc.levelKey = level.levelKey;
    }

    await doc.save();
    await auditService.log(req, {
      action: 'student.update', entityType: 'student', entityId: doc._id, before, after: doc,
    });
    const fresh = await Student.findById(doc._id).select(HIDDEN).populate(POPULATE);
    send(res, fresh);
  } catch (err) {
    next(err);
  }
}

async function deleteStudent(req, res, next) {
  try {
    const doc = await Student.findOne({ _id: req.params.id, isDeleted: false });
    if (!doc) throw new AppError('Student not found.', 404, 'NOT_FOUND');
    const before = doc.toObject();
    doc.isDeleted = true;
    await doc.save();
    await auditService.log(req, {
      action: 'student.delete', entityType: 'student', entityId: doc._id, before,
    });
    send(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listStudents, getStudent, createStudent, updateStudent, deleteStudent };