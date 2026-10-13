const {
  Institution,
  Department,
  Level,
  Student,
  Price,
  HandoutFile,
  Payment,
  HandoutOrder,
  Submission,
} = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { normKey } = require('../services/normalize');
const auditService = require('../services/auditService');

const inUse = (what) =>
  new AppError(`This ${what} is in use and cannot be deleted. You can deactivate it instead.`, 409, 'IN_USE');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

async function findOrFail(Model, id, label) {
  const doc = await Model.findById(id);
  if (!doc) throw new AppError(`${label} not found.`, 404, 'NOT_FOUND');
  return doc;
}

// How many students, PDFs, payments, orders and submissions point at this record
async function countRefs(field, id) {
  const q = { [field]: id };
  const counts = await Promise.all([
    Student.countDocuments(q),
    HandoutFile.countDocuments(q),
    Payment.countDocuments(q),
    HandoutOrder.countDocuments(q),
    Submission.countDocuments(q),
  ]);
  return counts.reduce((a, b) => a + b, 0);
}

function applyChanges(doc, body) {
  if (body.name !== undefined) doc.name = body.name;
  if (body.isActive !== undefined) doc.isActive = body.isActive;
}

/* ---------- Institutions ---------- */

async function listInstitutions(req, res, next) {
  try {
    send(res, await Institution.find().sort({ nameKey: 1 }));
  } catch (err) {
    next(err);
  }
}

async function createInstitution(req, res, next) {
  try {
    const doc = await Institution.create({ name: req.body.name });
    await auditService.log(req, {
      action: 'institution.create', entityType: 'institution', entityId: doc._id, after: doc,
    });
    send(res, doc, 201);
  } catch (err) {
    next(err);
  }
}

async function updateInstitution(req, res, next) {
  try {
    const doc = await findOrFail(Institution, req.params.id, 'Institution');
    const before = doc.toObject();
    applyChanges(doc, req.body);
    await doc.save();
    await auditService.log(req, {
      action: 'institution.update', entityType: 'institution', entityId: doc._id, before, after: doc,
    });
    send(res, doc);
  } catch (err) {
    next(err);
  }
}

async function deleteInstitution(req, res, next) {
  try {
    const doc = await findOrFail(Institution, req.params.id, 'Institution');
    const used =
      (await Department.countDocuments({ institution: doc._id })) +
      (await Price.countDocuments({ institution: doc._id })) +
      (await countRefs('institution', doc._id));
    if (used > 0) throw inUse('institution');
    await doc.deleteOne();
    await auditService.log(req, {
      action: 'institution.delete', entityType: 'institution', entityId: doc._id, before: doc,
    });
    send(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

/* ---------- Departments ---------- */

async function listDepartments(req, res, next) {
  try {
    const filter = {};
    if (req.query.institution) filter.institution = req.query.institution;
    send(res, await Department.find(filter).sort({ nameKey: 1 }));
  } catch (err) {
    next(err);
  }
}

async function createDepartment(req, res, next) {
  try {
    const inst = await findOrFail(Institution, req.body.institution, 'Institution');
    const doc = await Department.create({ institution: inst._id, name: req.body.name });
    await auditService.log(req, {
      action: 'department.create', entityType: 'department', entityId: doc._id, after: doc,
    });
    send(res, doc, 201);
  } catch (err) {
    next(err);
  }
}

async function updateDepartment(req, res, next) {
  try {
    const doc = await findOrFail(Department, req.params.id, 'Department');
    const before = doc.toObject();
    applyChanges(doc, req.body);
    await doc.save();
    await auditService.log(req, {
      action: 'department.update', entityType: 'department', entityId: doc._id, before, after: doc,
    });
    send(res, doc);
  } catch (err) {
    next(err);
  }
}

async function deleteDepartment(req, res, next) {
  try {
    const doc = await findOrFail(Department, req.params.id, 'Department');
    const used =
      (await Level.countDocuments({ department: doc._id })) +
      (await countRefs('department', doc._id));
    if (used > 0) throw inUse('department');
    await doc.deleteOne();
    await auditService.log(req, {
      action: 'department.delete', entityType: 'department', entityId: doc._id, before: doc,
    });
    send(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

/* ---------- Levels ---------- */

async function listLevels(req, res, next) {
  try {
    const filter = {};
    if (req.query.department) filter.department = req.query.department;
    if (req.query.institution) filter.institution = req.query.institution;
    send(res, await Level.find(filter).sort({ levelKey: 1 }));
  } catch (err) {
    next(err);
  }
}

async function createLevel(req, res, next) {
  try {
    const dept = await findOrFail(Department, req.body.department, 'Department');
    const doc = await Level.create({
      institution: dept.institution,
      department: dept._id,
      name: req.body.name,
    });
    await auditService.log(req, {
      action: 'level.create', entityType: 'level', entityId: doc._id, after: doc,
    });
    send(res, doc, 201);
  } catch (err) {
    next(err);
  }
}

async function updateLevel(req, res, next) {
  try {
    const doc = await findOrFail(Level, req.params.id, 'Level');
    const before = doc.toObject();

    if (req.body.name !== undefined && normKey(req.body.name) !== doc.levelKey) {
      const used =
        (await countRefs('level', doc._id)) +
        (await Price.countDocuments({ institution: doc.institution, levelKey: doc.levelKey }));
      if (used > 0) {
        throw new AppError(
          'This level is in use and cannot be renamed. Deactivate it and add a new one instead.',
          409,
          'IN_USE'
        );
      }
    }

    applyChanges(doc, req.body);
    await doc.save();
    await auditService.log(req, {
      action: 'level.update', entityType: 'level', entityId: doc._id, before, after: doc,
    });
    send(res, doc);
  } catch (err) {
    next(err);
  }
}

async function deleteLevel(req, res, next) {
  try {
    const doc = await findOrFail(Level, req.params.id, 'Level');
    if ((await countRefs('level', doc._id)) > 0) throw inUse('level');

    // A price belongs to institution + level name, so it only blocks the last level using that name
    const sharing = await Level.countDocuments({
      institution: doc.institution,
      levelKey: doc.levelKey,
      _id: { $ne: doc._id },
    });
    if (sharing === 0 && (await Price.exists({ institution: doc.institution, levelKey: doc.levelKey }))) {
      throw new AppError(
        'A price is still set for this level. Remove the price first, or deactivate the level instead.',
        409,
        'IN_USE'
      );
    }

    await doc.deleteOne();
    await auditService.log(req, {
      action: 'level.delete', entityType: 'level', entityId: doc._id, before: doc,
    });
    send(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listInstitutions, createInstitution, updateInstitution, deleteInstitution,
  listDepartments, createDepartment, updateDepartment, deleteDepartment,
  listLevels, createLevel, updateLevel, deleteLevel,
};