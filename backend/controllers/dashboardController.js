const { Student, Submission, Payment, HandoutOrder } = require('../models');

const PENDING_AFTER_MS = 15 * 60 * 1000;

function send(res, data) {
  res.status(200).json({ success: true, data });
}

// Monday 00:00 in Nigerian time (UTC+1, no daylight saving), as a UTC date
function weekStart() {
  const l = new Date(Date.now() + 60 * 60 * 1000);
  const mondayLagos = Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate() - ((l.getUTCDay() + 6) % 7));
  return new Date(mondayLagos - 60 * 60 * 1000);
}

function sumOf(result) {
  return result && result[0] ? result[0].total : 0;
}

async function overview(req, res, next) {
  try {
    const isSuper = req.admin.role === 'superadmin';
    const stale = new Date(Date.now() - PENDING_AFTER_MS);
    const start = weekStart();

    const jobs = [
      Student.countDocuments({ isDeleted: false }),
      Student.countDocuments({ isDeleted: false, ictFeePaid: true }),
      Submission.countDocuments({ isDeleted: false }),
      HandoutOrder.countDocuments({}),
      Payment.countDocuments({ status: 'pending', createdAt: { $lt: stale } }),
      Payment.countDocuments({ status: 'flagged' }),
      HandoutOrder.countDocuments({ delivery: 'pickup', 'pickup.status': 'pending' }),
      Payment.find({})
        .select('reference type status amount payer.name createdAt')
        .sort({ createdAt: -1, _id: -1 })
        .limit(8)
        .lean(),
    ];
    if (isSuper) {
      jobs.push(
        Payment.aggregate([{ $match: { status: 'success' } }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
        Payment.aggregate([
          { $match: { status: 'success', confirmedAt: { $gte: start } } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ])
      );
    }

    const r = await Promise.all(jobs);

    send(res, {
      stats: { students: r[0], ictFeesPaid: r[1], submissions: r[2], handouts: r[3] },
      attention: { pendingPayments: r[4], flaggedPayments: r[5], pickupsWaiting: r[6] },
      recent: r[7].map((p) => ({
        id: String(p._id),
        reference: p.reference,
        type: p.type,
        status: p.status,
        amount: p.amount,
        payerName: (p.payer && p.payer.name) || '',
        createdAt: p.createdAt,
      })),
      money: isSuper ? { total: sumOf(r[8]), thisWeek: sumOf(r[9]) } : null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { overview };