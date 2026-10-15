const crypto = require('crypto');
const { Payment, Student, Price, Level, Setting } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { env } = require('../config/env');
const paystack = require('./paystackProvider');

// Paystack needs an email. Students who only gave a phone number get a placeholder.
const NO_EMAIL_DOMAIN = 'noemail.example.com';
const REF_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_MAX_FILES = 10;

function generateReference() {
  let s = '';
  for (let i = 0; i < 12; i++) s += REF_CHARS[crypto.randomInt(REF_CHARS.length)];
  return 'PAY-' + s;
}

function callbackUrlFor(reference) {
  return env.frontendUrl + '/payment-callback.html?reference=' + encodeURIComponent(reference);
}

function fullName(s) {
  return [s.surname, s.firstname, s.othername].filter(Boolean).join(' ');
}

async function loadStudent(studentId) {
  const student = await Student.findOne({ _id: studentId, isDeleted: false });
  if (!student) throw new AppError('Student not found.', 404, 'NOT_FOUND');
  return student;
}

/* ---------- ICT fee ---------- */

// The ICT fee comes from the price row for the student's institution and level name.
async function feeAmountFor(student) {
  if (student.ictFeePaid || (await Payment.exists({ student: student._id, type: 'ict_fee', status: 'success' }))) {
    throw new AppError('Your ICT fee has already been paid.', 409, 'ALREADY_PAID');
  }
  const price = await Price.findOne({ institution: student.institution, levelKey: student.levelKey });
  if (!price || !Number.isInteger(price.ictFee) || price.ictFee <= 0) {
    throw new AppError('The ICT fee has not been set yet. Please contact your course lecturer.', 400, 'PRICE_NOT_SET');
  }
  return price.ictFee;
}

// Amount shown to the student before paying (kobo). If the fee is already paid, the receipt reference is returned.
async function quoteIctFee(studentId) {
  const student = await loadStudent(studentId);
  const paid = await Payment.findOne({ student: student._id, type: 'ict_fee', status: 'success' }).select('reference');
  if (paid) return { alreadyPaid: true, reference: paid.reference };
  return { alreadyPaid: false, amount: await feeAmountFor(student), currency: 'NGN' };
}

/* ---------- Assignment ---------- */

async function maxFilesPerPurchase() {
  const s = await Setting.findOne({ key: 'global' }).select('maxFilesPerPurchase').lean();
  return (s && s.maxFilesPerPurchase) || DEFAULT_MAX_FILES;
}

async function checkFileCount(files) {
  const max = await maxFilesPerPurchase();
  const n = Number(files);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new AppError('Choose between 1 and ' + max + ' files.', 400, 'BAD_FILE_COUNT');
  }
  return { count: n, max };
}

// The assignment price per file comes from the student's own department and level.
async function assignmentPriceFor(student) {
  const level = await Level.findById(student.level).select('assignmentPerFile');
  if (!level || !Number.isInteger(level.assignmentPerFile) || level.assignmentPerFile <= 0) {
    throw new AppError('The assignment price has not been set yet. Please contact your course lecturer.', 400, 'PRICE_NOT_SET');
  }
  return level.assignmentPerFile;
}

async function quoteAssignment(studentId, files) {
  const student = await loadStudent(studentId);
  const { count, max } = await checkFileCount(files === undefined || files === '' ? 1 : files);
  const pricePerFile = await assignmentPriceFor(student);
  return { pricePerFile, files: count, maxFiles: max, amount: pricePerFile * count, currency: 'NGN' };
}

/* ---------- Quote and initialize ---------- */

async function quote({ type, studentId, files }) {
  if (type === 'ict_fee') return quoteIctFee(studentId);
  if (type === 'assignment') return quoteAssignment(studentId, files);
  throw new AppError('This payment type is not available yet.', 400, 'NOT_AVAILABLE');
}

// Creates the pending payment and returns the Paystack link. The amount is always calculated here.
async function initializePayment({ type, studentId, files }) {
  if (type !== 'ict_fee' && type !== 'assignment') {
    throw new AppError('This payment type is not available yet.', 400, 'NOT_AVAILABLE');
  }

  const student = await loadStudent(studentId);
  let amount;
  let details;
  if (type === 'ict_fee') {
    amount = await feeAmountFor(student);
  } else {
    const { count } = await checkFileCount(files);
    const pricePerFile = await assignmentPriceFor(student);
    amount = pricePerFile * count;
    details = { fileCount: count, pricePerFile };
  }

  const reference = generateReference();
  const email = student.email || reference.toLowerCase() + '@' + NO_EMAIL_DOMAIN;

  const payment = await Payment.create({
    reference,
    type,
    status: 'pending',
    amount,
    currency: 'NGN',
    student: student._id,
    payer: { name: fullName(student), email, phone: student.phone || '' },
    institution: student.institution,
    department: student.department,
    level: student.level,
    details,
  });

  try {
    const init = await paystack.initialize({
      email,
      amountKobo: amount,
      reference,
      callbackUrl: callbackUrlFor(reference),
      metadata: { type, studentId: String(student._id), fileCount: details ? details.fileCount : undefined },
      split: null,
    });
    payment.providerData = { accessCode: init.accessCode, authorizationUrl: init.authorizationUrl };
    await payment.save();
    return { reference, authorizationUrl: init.authorizationUrl, amount };
  } catch (err) {
    payment.status = 'failed';
    payment.flagReason = 'Could not start the payment with Paystack.';
    await payment.save();
    throw err;
  }
}

module.exports = { initializePayment, quote, quoteIctFee, quoteAssignment, generateReference, callbackUrlFor };