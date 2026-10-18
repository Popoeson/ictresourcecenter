const mongoose = require('mongoose');
const { Payment } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');
const { verifyAndFulfil } = require('../services/fulfilmentService');

const POPULATE = [
  { path: 'institution', select: 'name' },
  { path: 'department', select: 'name' },
  { path: 'level', select: 'name' },
];
const FIELDS =
  'reference type status amount currency payer institution department level details confirmedAt confirmedVia receiptNumber flagReason createdAt providerData.paidAt providerData.channel';

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function oid(v) {
  return new mongoose.Types.ObjectId(v);
}

// Dates are treated as Nigerian local days (UTC+1, no daylight saving)
function buildFilter(q, withStatus) {
  const f = {};
  if (q.type) f.type = q.type;
  if (withStatus && q.status) f.status = q.status;
  ['institution', 'department', 'level'].forEach((k) => {
    if (q[k]) f[k] = oid(q[k]);
  });
  if (q.from || q.to) {
    f.createdAt = {};
    if (q.from) f.createdAt.$gte = new Date(q.from + 'T00:00:00+01:00');
    if (q.to) f.createdAt.$lte = new Date(q.to + 'T23:59:59.999+01:00');
  }
  const text = q.q ? String(q.q).trim() : '';
  if (text) {
    const rx = escapeRegex(text);
    f.$or = [
      { reference: { $regex: '^' + rx, $options: 'i' } },
      { receiptNumber: { $regex: '^' + rx, $options: 'i' } },
      { 'payer.name': { $regex: rx, $options: 'i' } },
      { 'payer.email': { $regex: rx, $options: 'i' } },
      { 'payer.phone': { $regex: rx, $options: 'i' } },
    ];
  }
  return f;
}

function toRow(p, isSuper) {
  const d = p.details || {};
  const row = {
    id: String(p._id),
    reference: p.reference,
    type: p.type,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    payerName: (p.payer && p.payer.name) || '',
    institution: p.institution ? p.institution.name : '',
    department: p.department ? p.department.name : '',
    level: p.level ? p.level.name : '',
    fileCount: d.fileCount || null,
    delivery: d.delivery || null,
    receiptNumber: p.receiptNumber || null,
    channel: (p.providerData && p.providerData.channel) || null,
    paidAt: (p.providerData && p.providerData.paidAt) || p.confirmedAt || null,
    createdAt: p.createdAt,
  };
  if (isSuper) {
    row.flagReason = p.flagReason || '';
    row.confirmedVia = p.confirmedVia || null;
  }
  return row;
}

async function list(req, res, next) {
  try {
    const isSuper = req.admin.role === 'superadmin';
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const filter = buildFilter(req.query, true);

    const [docs, total, groups] = await Promise.all([
      Payment.find(filter)
        .select(FIELDS)
        .populate(POPULATE)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Payment.countDocuments(filter),
            // Totals ignore the status filter so the breakdown stays visible. Shown to Admin and Super Admin.
      Payment.aggregate([
        { $match: buildFilter(req.query, false) },
        { $group: { _id: '$status', count: { $sum: 1 }, total: { $sum: '$amount' } } },
            ]),
    ]);

    let summary = null;
    if (groups) {
      const by = {};
      groups.forEach((g) => {
        by[g._id] = g;
      });
      summary = {
        collectedTotal: by.success ? by.success.total : 0,
        collectedCount: by.success ? by.success.count : 0,
        pendingCount: by.pending ? by.pending.count : 0,
        flaggedCount: by.flagged ? by.flagged.count : 0,
      };
    }

    send(res, {
      items: docs.map((p) => toRow(p, isSuper)),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary,
    });
  } catch (err) {
    next(err);
  }
}

// Super Admin: check a pending payment with Paystack again
async function reverify(req, res, next) {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) throw new AppError('Payment not found.', 404, 'NOT_FOUND');
    if (payment.status !== 'pending') {
      throw new AppError('Only pending payments can be re-verified.', 400, 'NOT_PENDING');
    }

    const before = { status: payment.status, reference: payment.reference };
    const result = await verifyAndFulfil(payment.reference, 'reverify');

    await auditService.log(req, {
      action: 'payment.reverify',
      entityType: 'payment',
      entityId: payment._id,
      before,
      after: { status: result.payment.status, outcome: result.outcome },
    });
    send(res, { outcome: result.outcome, status: result.payment.status });
  } catch (err) {
    next(err);
  }
}

module.exports = { list, reverify, buildFilter, toRow };