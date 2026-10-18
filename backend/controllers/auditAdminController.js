const mongoose = require('mongoose');
const { AuditLog, Admin } = require('../models');

const ID_RX = /^[a-f\d]{24}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DETAIL_CHARS = 20000;

function send(res, data) {
  res.status(200).json({ success: true, data });
}

function buildFilter(q) {
  const f = {};
  if (typeof q.action === 'string' && q.action.length <= 80) f.action = q.action;
  if (typeof q.actor === 'string' && ID_RX.test(q.actor)) f.actor = new mongoose.Types.ObjectId(q.actor);

  // Dates are treated as Nigerian local days (UTC+1)
  const from = typeof q.from === 'string' && DATE_RX.test(q.from) ? q.from : '';
  const to = typeof q.to === 'string' && DATE_RX.test(q.to) ? q.to : '';
  if (from || to) {
    f.createdAt = {};
    if (from) f.createdAt.$gte = new Date(from + 'T00:00:00+01:00');
    if (to) f.createdAt.$lte = new Date(to + 'T23:59:59.999+01:00');
  }
  return f;
}

// Very large records are replaced by a note, so one entry cannot make the page heavy
function shrink(value) {
  if (value === undefined || value === null) return null;
  try {
    if (JSON.stringify(value).length > MAX_DETAIL_CHARS) return { note: 'This record is too large to show here.' };
  } catch (e) {
    return { note: 'This record could not be shown.' };
  }
  return value;
}

function toRow(l) {
  const actor = l.actor;
  return {
    id: String(l._id),
    createdAt: l.createdAt,
    actorId: actor ? String(actor._id) : null,
    actorName: actor ? actor.name : l.actorRole ? 'Removed admin' : 'System',
    actorRole: l.actorRole || (actor ? actor.role : '') || '',
    action: l.action,
    entityType: l.entityType || '',
    entityId: l.entityId ? String(l.entityId) : null,
    ip: l.ip || '',
    before: shrink(l.before),
    after: shrink(l.after),
  };
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = buildFilter(req.query);

    const [docs, total] = await Promise.all([
      AuditLog.find(filter)
        .populate('actor', 'name role')
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      AuditLog.countDocuments(filter),
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

// The options for the two filter drop-downs
async function filters(req, res, next) {
  try {
    const [actions, actorIds] = await Promise.all([AuditLog.distinct('action'), AuditLog.distinct('actor')]);
    const admins = await Admin.find({ _id: { $in: actorIds.filter(Boolean) } })
      .select('name role')
      .lean();

    send(res, {
      actions: actions.sort(),
      actors: admins
        .map((a) => ({ id: String(a._id), name: a.name, role: a.role }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, filters };