const crypto = require('crypto');
const { Payment, Student, HandoutFile, HandoutOrder } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const fileService = require('./fileService');
const { normKey, phoneKey } = require('./normalize');

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_CODE_TRIES = 5;
const LINK_SECONDS = 300;

// HND- followed by 6 random uppercase letters or digits, for example HND-4F9K2Z
function generatePickupCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CHARS[crypto.randomInt(CHARS.length)];
  return 'HND-' + s;
}

// Email first, phone as fallback
async function matchStudent(buyer) {
  const emailKey = buyer.email ? normKey(buyer.email) : '';
  if (emailKey) {
    const s = await Student.findOne({ emailKey, isDeleted: false }).select('_id');
    if (s) return { student: s._id, by: 'email' };
  }
  const pk = phoneKey(buyer.phone);
  if (pk) {
    const s = await Student.findOne({ phoneKey: pk, isDeleted: false }).select('_id');
    if (s) return { student: s._id, by: 'phone' };
  }
  return null;
}

function activeFileFor(scope) {
  return HandoutFile.findOne({
    institution: scope.institution,
    department: scope.department,
    level: scope.level,
    isActive: true,
  });
}

// The newest PDF for the buyer's level. If it was replaced, the buyer gets the replacement.
async function resolveFile(order) {
  const current = await activeFileFor(order);
  if (current) return current;
  return order.handoutFile ? HandoutFile.findById(order.handoutFile) : null;
}

// Makes the order for a paid handout payment. Safe to call again: a payment only ever has one order.
async function createOrder(payment) {
  const existing = await HandoutOrder.findOne({ payment: payment._id });
  if (existing) return existing;

  const delivery = payment.details && payment.details.delivery;
  if (delivery !== 'pdf' && delivery !== 'pickup') {
    throw new AppError('This handout payment has no delivery option.', 500, 'ORDER_ERROR');
  }

  const payer = payment.payer || {};
  const buyer = { name: payer.name || '', phone: payer.phone || '', email: payer.email || '' };
  const match = await matchStudent(buyer);

  let file = null;
  if (delivery === 'pdf') {
    file = await activeFileFor(payment);
    if (!file) logger.warn({ reference: payment.reference }, 'Paid PDF handout has no PDF uploaded');
  }

  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    const doc = {
      payment: payment._id,
      buyer,
      institution: payment.institution,
      department: payment.department,
      level: payment.level,
      delivery,
      handoutFile: file ? file._id : null,
      isStudent: !!match,
      matchedStudent: match ? match.student : null,
      matchedBy: match ? match.by : null,
    };
    if (delivery === 'pickup') {
      doc.pickupCode = generatePickupCode();
      doc.pickup = { status: 'pending' };
    }

    try {
      return await HandoutOrder.create(doc);
    } catch (err) {
      if (err && err.code === 11000) {
        const kp = err.keyPattern || {};
        if (kp.payment) return HandoutOrder.findOne({ payment: payment._id });
        if (kp.pickupCode) continue;
      }
      throw err;
    }
  }
  throw new AppError('Could not create the order. Please try again.', 500, 'ORDER_ERROR');
}

// What the callback page shows for a paid handout. Creates the order now if an earlier attempt failed.
async function handoutInfo(reference) {
  const payment = await Payment.findOne({ reference, status: 'success', type: 'handout' });
  if (!payment) return null;

  const order = await createOrder(payment);
  let pdfAvailable = false;
  if (order.delivery === 'pdf') pdfAvailable = !!(await resolveFile(order));

  return {
    delivery: order.delivery,
    pickupCode: order.pickupCode || null,
    pickupStatus: (order.pickup && order.pickup.status) || null,
    pdfAvailable,
  };
}

// A fresh short-lived download link for a paid PDF order
async function signedLinkFor(reference) {
  const payment = await Payment.findOne({ reference, status: 'success', type: 'handout' });
  if (!payment) throw new AppError('Handout not found.', 404, 'NOT_FOUND');

  const order = await createOrder(payment);
  if (order.delivery !== 'pdf') {
    throw new AppError('This order is for pickup, so there is no PDF to download.', 400, 'NOT_PDF');
  }

  const file = await resolveFile(order);
  if (!file) {
    throw new AppError('The PDF is not available right now. Please contact your course lecturer.', 404, 'PDF_NOT_AVAILABLE');
  }

  const url = fileService.signedDownloadUrl({
    publicId: file.file.publicId,
    resourceType: file.file.resourceType,
    format: 'pdf',
    ttlSeconds: LINK_SECONDS,
  });
  return { url, expiresInSeconds: LINK_SECONDS };
}

module.exports = { createOrder, handoutInfo, signedLinkFor, generatePickupCode };