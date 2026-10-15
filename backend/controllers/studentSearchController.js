const { Student } = require('../models');
const { normKey } = require('../services/normalize');

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Public name search: institution + level name + at least 3 characters. Returns the minimum (name and department).
async function search(req, res, next) {
  try {
    const { institution, levelKey, q } = req.query;
    const words = normKey(q).split(' ').filter(Boolean);

    const filter = {
      isDeleted: false,
      institution,
      levelKey: normKey(levelKey),
      $and: words.map((w) => ({ searchTokens: { $regex: '^' + escapeRegex(w) } })),
    };

    const docs = await Student.find(filter)
      .select('surname firstname othername department')
      .populate('department', 'name')
      .sort({ surname: 1, firstname: 1, _id: 1 })
      .limit(10);

    const items = docs.map((s) => ({
      id: String(s._id),
      name: [s.surname, s.firstname, s.othername].filter(Boolean).join(' '),
      department: s.department ? s.department.name : '',
    }));
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
}

module.exports = { search };