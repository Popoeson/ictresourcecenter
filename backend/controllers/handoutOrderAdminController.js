const mongoose = require('mongoose');
const { HandoutOrder } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');

const ID_RX = /^[a-f\d]{24}$/i;

const POPULATE = [
  { path: 'institution', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'level', select: 'name' },
  { path: 'payment', select: 'reference receiptNumber amount' },
  { path: 'pickup.collectedBy', select: 'name' },
];

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toRow(o) {
  const pickup = o.pickup || {};
  return {
    id: String(o._id),
    createdAt: o.createdAt,
    buyerName: (o.buyer && o.buyer.name) || '',
    buyerEmail: (o.buyer && o.buyer.email) || '',
    buyerPhone: (o.buyer && o.buyer.phone) || '',
    institution: o.institution ? o.institution.name : '',
    department: o.department ? o.department.name : '',
    level: o.level ? o.level.name : '',
    delivery: o.delivery,
    pickupCode: o.pickupCode || null,
    pickupStatus: pickup.status || null,
    collectedAt: pickup.collectedAt || null,
    collectedBy: pickup.collectedBy ? pickup.collectedBy.name : null,
    isStudent: !!o.isStudent,
    matchedBy: o.matchedBy || null,
    amount: o.payment ? o.payment.amount : null,
    reference: o.payment ? o.payment.reference : null,
    receiptNumber: o.payment ? o.payment.receiptNumber || null : null,
  };
}

async function loadRow(id) {
  return toRow(await HandoutOrder.findById(id).populate(POPULATE));
}

function buildFilter(q) {
  const f = {};
  if (q.delivery === 'pdf' || q.delivery === 'pickup') f.delivery = q.delivery;
  if (q.buyer === 'student') f.isStudent = true;
  if (q.buyer === 'non_student') f.isStudent = false;
  if (q.pickup === 'pending' || q.pickup === 'collected') f['pickup.status'] = q.pickup;

  ['institution', 'department', 'level'].forEach((k) => {
    if (q[k] && ID_RX.test(q[k])) f[k] = new mongoose.Types.ObjectId(q[k]);
  });

  // Dates are treated as Nigerian local days (UTC+1)
  if (q.from || q.to) {
    f.createdAt = {};
    if (q.from) f.createdAt.$gte = new Date(q.from + 'T00:00:00+01:00');
    if (q.to) f.createdAt.$lte = new Date(q.to + 'T23:59:59.999+01:00');
  }

  const text = q.q ? String(q.q).trim() : '';
  if (text) {
    const rx = escapeRegex(text);
    const or = [
      { 'buyer.name': { $regex: rx, $options: 'i' } },
      { 'buyer.email': { $regex: rx, $options: 'i' } },
      { 'buyer.phone': { $regex: rx, $options: 'i' } },
    ];
    // "hnd-4f9k2z", "HND 4F9K2Z" and "4F9K2Z" all find the same pickup code
    const raw = text.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw) {
      const body = raw.startsWith('HND') ? raw.slice(3) : raw;
      if (body) or.push({ pickupCode: { $regex: '^HND-' + escapeRegex(body) } });
    }
    f.$or = or;
  }
  return f;
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = buildFilter(req.query);

    const [docs, total, pendingPickups] = await Promise.all([
      HandoutOrder.find(filter)
        .populate(POPULATE)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      HandoutOrder.countDocuments(filter),
      HandoutOrder.countDocuments({ delivery: 'pickup', 'pickup.status': 'pending' }),
    ]);

    send(res, {
      items: docs.map(toRow),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: { pendingPickups },
    });
  } catch (err) {
    next(err);
  }
}

// Admin and Super Admin: mark a pickup order as collected (project owner's decision)
async function collect(req, res, next) {
  try {
    const now = new Date();
    // Only one request can win, so a double tap cannot collect an order twice
    const won = await HandoutOrder.findOneAndUpdate(
      { _id: req.params.id, delivery: 'pickup', 'pickup.status': 'pending' },
      { $set: { 'pickup.status': 'collected', 'pickup.collectedAt': now, 'pickup.collectedBy': req.admin._id } },
      { new: true }
    );

    if (!won) {
      const o = await HandoutOrder.findById(req.params.id).select('delivery pickup');
      if (!o) throw new AppError('Order not found.', 404, 'NOT_FOUND');
      if (o.delivery !== 'pickup') {
        throw new AppError('This is a PDF order, so there is nothing to collect.', 400, 'NOT_PICKUP');
      }
      throw new AppError('This order has already been collected.', 409, 'ALREADY_COLLECTED');
    }

    await auditService.log(req, {
      action: 'handout.collect',
      entityType: 'handoutOrder',
      entityId: won._id,
      before: { status: 'pending' },
      after: { status: 'collected', pickupCode: won.pickupCode, collectedAt: now },
    });

    send(res, await loadRow(won._id));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, collect, buildFilter, toRow, POPULATE };