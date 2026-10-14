const { Institution, Department, Level } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');

function send(res, data) {
  res.json({ success: true, data });
}

function amountOf(level) {
  return level.assignmentPerFile === undefined ? null : level.assignmentPerFile;
}

// Institution, then its departments, then each department's levels with their assignment price
async function listAssignmentPrices(req, res, next) {
  try {
    const filter = req.query.institution ? { _id: req.query.institution } : {};
    const institutions = await Institution.find(filter).sort({ nameKey: 1 });
    const ids = institutions.map((i) => i._id);
    const departments = await Department.find({ institution: { $in: ids } }).sort({ nameKey: 1 });
    const levels = await Level.find({ institution: { $in: ids } }).sort({ levelKey: 1 });

    const result = institutions.map((inst) => ({
      institution: { id: inst._id, name: inst.name, isActive: inst.isActive },
      departments: departments
        .filter((d) => String(d.institution) === String(inst._id))
        .map((d) => ({
          id: d._id,
          name: d.name,
          isActive: d.isActive,
          levels: levels
            .filter((l) => String(l.department) === String(d._id))
            .map((l) => ({
              id: l._id,
              levelKey: l.levelKey,
              levelLabel: l.name,
              assignmentPerFile: amountOf(l),
              isActive: l.isActive,
            })),
        })),
    }));

    send(res, result);
  } catch (err) {
    next(err);
  }
}

// Send null to clear the price
async function saveAssignmentPrice(req, res, next) {
  try {
    const level = await Level.findById(req.body.level);
    if (!level) throw new AppError('Level not found.', 404, 'NOT_FOUND');

    const before = { assignmentPerFile: amountOf(level) };
    level.assignmentPerFile = req.body.assignmentPerFile;
    await level.save();

    await auditService.log(req, {
      action: 'price.assignment.update',
      entityType: 'level',
      entityId: level._id,
      before,
      after: { assignmentPerFile: amountOf(level) },
    });
    send(res, { id: level._id, assignmentPerFile: amountOf(level) });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAssignmentPrices, saveAssignmentPrice };