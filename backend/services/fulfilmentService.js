const { Payment, Student, Token } = require('../models');
const Counter = require('../models/Counter');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const paystack = require('./paystackProvider');
const tokenService = require('./tokenService');
const handoutOrderService = require('./handoutOrderService');

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
  } else if (won.type === 'assignment') {
    // The 30-minute window starts now, at payment confirmation.
    // If this fails, the payment stays successful and the token is created when the callback page is next opened.
    try {
      await tokenService.createToken({
        student: won.student,
        payment: won._id,
        source: 'payment',
        filesAllowed: (won.details && won.details.fileCount) || 1,
        startsAt: won.confirmedAt,
      });
    } catch (err) {
      logger.error({ reference, err: err.message }, 'Token creation failed after payment');
    }
  }
  
if (won.type === 'handout') {
    // If this fails, the payment stays successful and the order is created when the callback page is next opened.
    try {
      await handoutOrderService.createOrder(won);
    } catch (err) {
      logger.error({ reference, err: err.message }, 'Handout order creation failed after payment');
    }
  }

  logger.info({ reference, via, type: won.type }, 'Payment fulfilled');
  return Payment.findById(won._id);
}

// The token details for a paid assignment. The code is shown only while the token can still be used.
// If the token is missing (an earlier failure), it is created now with the original confirmation time.
async function tokenInfo(reference) {
  const payment = await Payment.findOne({ reference, status: 'success', type: 'assignment' });
  if (!payment) return null;

  let token = await Token.findOne({ payment: payment._id });
  if (!token) {
    token = await tokenService.createToken({
      student: payment.student,
      payment: payment._id,
      source: 'payment',
      filesAllowed: (payment.details && payment.details.fileCount) || 1,
      startsAt: payment.confirmedAt || new Date(),
    });
  }

  const now = Date.now();
  const live = (token.status === 'active' || token.status === 'in_progress') && token.expiresAt.getTime() > now;
  let status = token.status;
  if (!live && status !== 'used' && status !== 'revoked') status = 'expired';

  return {
    status,
    code: live ? token.code : null,
    filesAllowed: token.filesAllowed,
    expiresAt: token.expiresAt,
    secondsLeft: live ? Math.max(0, Math.floor((token.expiresAt.getTime() - now) / 1000)) : 0,
  };
}

// Checks the payment with Paystack by reference and fulfils it when it succeeded.
// outcome: success | not_completed | processing | flagged
async function verifyCore(reference, via) {
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

// Same as above, and for a paid assignment it adds the token details for the callback page.
async function verifyAndFulfil(reference, via) {
  const result = await verifyCore(reference, via);
  if (result.outcome === 'success' && result.payment.type === 'assignment') {
    result.token = await tokenInfo(reference);
  } else if (result.outcome === 'success' && result.payment.type === 'handout') {
    try {
      result.handout = await handoutOrderService.handoutInfo(reference);
    } catch (err) {
      logger.error({ reference, err: err.message }, 'Could not load the handout order');
      result.handout = null;
    }
  }
  return result;
}

module.exports = { verifyAndFulfil, fulfilPayment, ensureReceiptNumber, summary, flag, tokenInfo };