const { Payment, Student, Price, Setting, Department } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { normKey } = require('./normalize');

// Infrastructure dues: paid in instalments against a total. Only Computer Science and Computer Engineering students pay.
// The server works out the balance from the successful payments. The browser is never trusted for amounts.

const ELIGIBLE_DEPARTMENT_KEYS = [normKey('Computer Science'), normKey('Computer Engineering')];

function naira(kobo) {
  const n = (Number(kobo) || 0) / 100;
  return '\u20A6' + n.toLocaleString('en-NG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
}

// Global settings, with safe defaults when they were never saved: 1 instalment, no minimum
async function getSettings() {
  const s = await Setting.findOne({ key: 'global' }).select('duesMaxInstalments duesMinInstalment').lean();
  const max = s && Number.isInteger(s.duesMaxInstalments) && s.duesMaxInstalments >= 1 ? s.duesMaxInstalments : 1;
  const min = s && Number.isInteger(s.duesMinInstalment) && s.duesMinInstalment > 0 ? s.duesMinInstalment : 0;
  return { maxInstalments: max, minInstalment: min };
}

async function ensureEligible(student) {
  const dept = await Department.findById(student.department).select('nameKey');
  if (!dept || !ELIGIBLE_DEPARTMENT_KEYS.includes(dept.nameKey)) {
    throw new AppError(
      'Infrastructure dues are only for Computer Science and Computer Engineering students.',
      403,
      'NOT_ELIGIBLE'
    );
  }
}

// The total dues for the student's institution and level name
async function totalFor(student) {
  const price = await Price.findOne({ institution: student.institution, levelKey: student.levelKey });
  if (!price || !Number.isInteger(price.infrastructureDues) || price.infrastructureDues <= 0) {
    throw new AppError(
      'The infrastructure dues have not been set yet. Please contact your course lecturer.',
      400,
      'PRICE_NOT_SET'
    );
  }
  return price.infrastructureDues;
}

async function paidSoFar(studentId) {
  const rows = await Payment.aggregate([
    { $match: { student: studentId, type: 'infrastructure_dues', status: 'success' } },
    { $group: { _id: null, paid: { $sum: '$amount' }, count: { $sum: 1 } } },
  ]);
  return rows.length ? { paid: rows[0].paid, count: rows[0].count } : { paid: 0, count: 0 };
}

// What the student sees before paying: total, paid so far, balance, and the allowed amounts
async function quote(student) {
  await ensureEligible(student);
  const total = await totalFor(student);
  const p = await paidSoFar(student._id);
  const s = await getSettings();
  const balance = Math.max(0, total - p.paid);

  const base = {
    currency: 'NGN',
    total,
    paid: p.paid,
    balance,
    paymentsMade: p.count,
    maxInstalments: s.maxInstalments,
  };
  if (balance <= 0) return { ...base, fullyPaid: true };

  // The last allowed instalment must clear the whole balance, so the dues always end fully paid
  const isLast = p.count + 1 >= s.maxInstalments;
  const minAmount = isLast ? balance : Math.min(Math.max(s.minInstalment, 1), balance);

  return {
    ...base,
    fullyPaid: false,
    instalmentNumber: p.count + 1,
    isLast,
    minAmount,
    maxAmount: balance,
    fixedAmount: isLast ? balance : null,
  };
}

// The amount to charge now. The last instalment is always the full balance. Otherwise the student's amount is checked.
async function amountFor(student, requested) {
  const q = await quote(student);
  if (q.fullyPaid) {
    throw new AppError('Your infrastructure dues have been fully paid.', 409, 'ALREADY_PAID');
  }
  if (q.isLast) return { amount: q.balance, quote: q };

  const n = Number(requested);
  if (!Number.isInteger(n) || n < q.minAmount || n > q.maxAmount) {
    const msg =
      q.minAmount === q.maxAmount
        ? 'The amount for this payment is ' + naira(q.maxAmount) + '.'
        : 'Enter an amount between ' + naira(q.minAmount) + ' and ' + naira(q.maxAmount) + '.';
    throw new AppError(msg, 400, 'BAD_AMOUNT');
  }
  return { amount: n, quote: q };
}

// Used when a dues payment is confirmed: is it still within the balance, and which instalment number is it?
async function numberFor(payment) {
  const p = await paidSoFar(payment.student);
  const student = await Student.findById(payment.student).select('institution levelKey');
  if (student) {
    const price = await Price.findOne({ institution: student.institution, levelKey: student.levelKey });
    if (price && Number.isInteger(price.infrastructureDues) && p.paid + payment.amount > price.infrastructureDues) {
      return {
        ok: false,
        reason:
          'Overpayment. Paid so far ' + p.paid + ' kobo, this payment ' + payment.amount +
          ' kobo, dues total ' + price.infrastructureDues + ' kobo. Refund this payment in Paystack.',
      };
    }
  }
  return { ok: true, number: p.count + 1 };
}

module.exports = { getSettings, quote, amountFor, numberFor, ELIGIBLE_DEPARTMENT_KEYS };