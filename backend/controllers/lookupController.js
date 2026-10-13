const { Institution, Department, Level } = require('../models');

function send(res, data) {
  res.json({ success: true, data });
}

async function institutions(req, res, next) {
  try {
    const items = await Institution.find({ isActive: true }).sort({ nameKey: 1 });
    send(res, items.map((i) => ({ id: i._id, name: i.name })));
  } catch (err) {
    next(err);
  }
}

async function departments(req, res, next) {
  try {
    const { institution } = req.query;
    const inst = await Institution.findOne({ _id: institution, isActive: true });
    if (!inst) return send(res, []);
    const items = await Department.find({ institution, isActive: true }).sort({ nameKey: 1 });
    send(res, items.map((d) => ({ id: d._id, name: d.name })));
  } catch (err) {
    next(err);
  }
}

// ?department=  returns that department's levels (with ids)
// ?institution= returns one entry per level name across the institution (no ids)
async function levels(req, res, next) {
  try {
    const { department, institution } = req.query;

    if (department) {
      const dept = await Department.findOne({ _id: department, isActive: true });
      if (!dept) return send(res, []);
      const inst = await Institution.findOne({ _id: dept.institution, isActive: true });
      if (!inst) return send(res, []);
      const items = await Level.find({ department, isActive: true }).sort({ levelKey: 1 });
      return send(res, items.map((l) => ({ id: l._id, key: l.levelKey, name: l.name })));
    }

    const inst = await Institution.findOne({ _id: institution, isActive: true });
    if (!inst) return send(res, []);
    const deptIds = await Department.find({ institution, isActive: true }).distinct('_id');
    const items = await Level.find({ department: { $in: deptIds }, isActive: true }).sort({ levelKey: 1 });

    const seen = new Set();
    const out = [];
    for (const l of items) {
      if (seen.has(l.levelKey)) continue;
      seen.add(l.levelKey);
      out.push({ key: l.levelKey, name: l.name });
    }
    send(res, out);
  } catch (err) {
    next(err);
  }
}

module.exports = { institutions, departments, levels };