const { Institution, Level, Price } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { normKey } = require('../services/normalize');
const auditService = require('../services/auditService');

const FIELDS = ['ictFee', 'handoutPrice'];

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// One block per institution, one row per level name (shared across departments)
async function listPrices(req, res, next) {
  try {
    const filter = req.query.institution ? { _id: req.query.institution } : {};
    const institutions = await Institution.find(filter).sort({ nameKey: 1 });
    const ids = institutions.map((i) => i._id);

    const levels = await Level.find({ institution: { $in: ids } }).sort({ levelKey: 1 });
    const prices = await Price.find({ institution: { $in: ids } });
    const priceMap = new Map(prices.map((p) => [`${p.institution}:${p.levelKey}`, p]));

    const result = institutions.map((inst) => {
      const seen = new Set();
      const rows = [];
      for (const l of levels) {
        if (String(l.institution) !== String(inst._id) || seen.has(l.levelKey)) continue;
        seen.add(l.levelKey);
        const p = priceMap.get(`${inst._id}:${l.levelKey}`);
        rows.push({
          priceId: p ? p._id : null,
          levelKey: l.levelKey,
          levelLabel: l.name,
          ictFee: p ? p.ictFee : null,
          handoutPrice: p ? p.handoutPrice : null,
        });
      }
      return {
        institution: { id: inst._id, name: inst.name, isActive: inst.isActive },
        levels: rows,
      };
    });

    send(res, result);
  } catch (err) {
    next(err);
  }
}

// Creates or updates one row. Only the amounts you send are changed. Send null to clear one.
async function savePrice(req, res, next) {
  try {
    const { institution } = req.body;
    const levelKey = normKey(req.body.levelKey);

    const level = await Level.findOne({ institution, levelKey });
    if (!level) throw new AppError('That level does not exist in this institution.', 404, 'NOT_FOUND');

    let doc = await Price.findOne({ institution, levelKey });
    const before = doc ? doc.toObject() : null;
    if (!doc) doc = new Price({ institution, levelKey, levelLabel: level.name });

    FIELDS.forEach((f) => {
      if (req.body[f] !== undefined) doc[f] = req.body[f];
    });
    doc.updatedBy = req.admin._id;
    await doc.save();

    await auditService.log(req, {
      action: 'price.update', entityType: 'price', entityId: doc._id, before, after: doc,
    });
    send(res, doc);
  } catch (err) {
    next(err);
  }
}

async function deletePrice(req, res, next) {
  try {
    const doc = await Price.findById(req.params.id);
    if (!doc) throw new AppError('Price not found.', 404, 'NOT_FOUND');
    await doc.deleteOne();
    await auditService.log(req, {
      action: 'price.delete', entityType: 'price', entityId: doc._id, before: doc,
    });
    send(res, { deleted: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listPrices, savePrice, deletePrice };