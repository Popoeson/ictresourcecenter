const { Payment, Student } = require('../models');
const Counter = require('../models/Counter');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const paystack = require('./paystackProvider');

// The callback page, the webhook and the Super Admin "re-verify" all use this file,
// so a payment is fulfilled exactly once whichever path gets there first.

function summary(p) {
  return {
    reference: p.reference,
    type: p.type,
    status: p.status,
    amount: p.amount,
    currency: p.currency,
    receiptNumber: p.receiptNumber || null,
    paidAt: (p.providerData && p.providerData.paidAt) || p.confirmedAt || null,
    payerName: (p.payer && p.payer.name) || '',
  };
}

async function flag(reference, reason) {
  await Payment.updateOne({ reference, status: 'pending' }, { $set: { status: 'flagged', flagReason: reason } });
  logger.warn({ reference, reason }, 'Payment flagged');
}

// Receipt numbers look like RCT-000123. Assigned once, even if two requests race.
async function ensureReceiptNumber(payment) {
  if (payment.receiptNumber) return payment;
  const seq = await Counter.next('receipt');
  const number = 'RCT-' + String(seq).padStart(6, '0');
  const updated = await Payment.findOneAndUpdate(
    { _id: payment._id, receiptNumber: { $exists: false } },
    { $set: { receiptNumber: number } },
    { new: true }
  );
  return updated || Payment.findById(payment._id);
}

// Moves pending to success with one atomic update. Only the caller that wins does the follow-up work.
async function fulfilPayment(reference, via, ps) {
  const set = { status: 'success', confirmedAt: new Date(), confirmedVia: via };
  if (ps.transactionId) set['providerData.transactionId'] = ps.transactionId;
  if (ps.channel) set['providerData.channel'] = ps.channel;
  if (ps.gatewayResponse) set['providerData.gatewayResponse'] = ps.gatewayResponse;
  if (ps.paidAt) set['providerData.paidAt'] = ps.paidAt;

  let won;
  try {
    won = await Payment.findOneAndUpdate({ reference, status: 'pending' }, { $set: set }, { new: true });
  } catch (err) {
    if (err && err.code === 11000) {
      await flag(reference, 'This student already paid the ICT fee. Refund this payment in Paystack.');
      return Payment.findOne({ reference });
    }
    throw err;
  }
  if (!won) return Payment.findOne({ reference });

  await ensureReceiptNumber(won);

  if (won.type === 'ict_fee') {
    await Student.updateOne(
      { _id: won.student },
      { $set: { ictFeePaid: true, ictFeePaidAt: won.confirmedAt, ictFeePayment: won._id } }
    );
  }
  // Assignment (tokens) and handout actions are added in phases 5 and 6.

  logger.info({ reference, via, type: won.type }, 'Payment fulfilled');
  return Payment.findById(won._id);
}

// Checks the payment with Paystack by reference and fulfils it when it succeeded.
// outcome: success | not_completed | processing | flagged
async function verifyAndFulfil(reference, via) {
  let payment = await Payment.findOne({ reference });
  if (!payment) throw new AppError('Payment not found.', 404, 'NOT_FOUND');

  if (payment.status === 'success') {
    payment = await ensureReceiptNumber(payment);
    return { outcome: 'success', payment: summary(payment) };
  }
  if (payment.status === 'flagged') return { outcome: 'flagged', payment: summary(payment) };
  if (payment.status === 'failed') return { outcome: 'not_completed', payment: summary(payment) };

  let ps;
  try {
    ps = await paystack.verify(reference);
  } catch (err) {
    if (err.code === 'PAYSTACK_ERROR') return { outcome: 'processing', payment: summary(payment) };
    throw err;
  }

  if (ps.status === 'success') {
    if (ps.amount !== payment.amount || ps.currency !== payment.currency) {
      await flag(
        reference,
        'Amount or currency mismatch. Expected ' + payment.amount + ' ' + payment.currency +
          ', Paystack reported ' + ps.amount + ' ' + ps.currency + '.'
      );
    } else {
      await fulfilPayment(reference, via, ps);
    }
    payment = await Payment.findOne({ reference });
    return { outcome: payment.status === 'success' ? 'success' : 'flagged', payment: summary(payment) };
  }

  if (ps.status === 'failed' || ps.status === 'reversed') {
    await Payment.updateOne({ reference, status: 'pending' }, { $set: { status: 'failed' } });
    return { outcome: 'not_completed', payment: summary(payment) };
  }
  if (ps.status === 'abandoned' || ps.status === 'not_found') {
    // Left pending on purpose: the customer may still finish paying, and the webhook can still confirm it.
    return { outcome: 'not_completed', payment: summary(payment) };
  }
  return { outcome: 'processing', payment: summary(payment) };
}

module.exports = { verifyAndFulfil, fulfilPayment, ensureReceiptNumber, summary, flag };