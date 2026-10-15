const crypto = require('crypto');
const { Payment, Student, Price, Level, Setting } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { env } = require('../config/env');
const paystack = require('./paystackProvider');

// Paystack needs an email. Students who only gave a phone number get a placeholder.
const NO_EMAIL_DOMAIN = 'noemail.example.com';
const REF_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

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

// The assignment price per file comes from the student's own department and level.
async function assignmentAmountFor(student, fileCount) {
  const files = Number(fileCount);
  const setting = await Setting.findOne({ key: 'global' }).select('maxFilesPerPurchase').lean();
  const max = (setting && setting.maxFilesPerPurchase) || 10;
  if (!Number.isInteger(files) || files < 1 || files > max) {
    throw new AppError('Choose between 1 and ' + max + ' files.', 400, 'BAD_FILE_COUNT');
  }
  const level = await Level.findById(student.level).select('assignmentPerFile');
  const pricePerFile = level && level.assignmentPerFile;
  if (!Number.isInteger(pricePerFile) || pricePerFile <= 0) {
    throw new AppError('The assignment price has not been set yet. Please contact your course lecturer.', 400, 'PRICE_NOT_SET');
  }
  return { amount: pricePerFile * files, pricePerFile, files, maxFiles: max };
}

// Total shown to the student before paying (kobo)
async function quoteAssignment(studentId, fileCount) {
  const student = await loadStudent(studentId);
  const a = await assignmentAmountFor(student, fileCount);
  return { amount: a.amount, pricePerFile: a.pricePerFile, files: a.files, maxFiles: a.maxFiles, currency: 'NGN' };
}

// Creates the pending payment and returns the Paystack link. The amount is always calculated here.
async function initializePayment({ type, studentId }) {
  if (type !== 'ict_fee') {
    throw new AppError('This payment type is not available yet.', 400, 'NOT_AVAILABLE');
  }

  const student = await loadStudent(studentId);
  const amount = await feeAmountFor(student);
  const reference = generateReference();
  const email = student.email || reference.toLowerCase() + '@' + NO_EMAIL_DOMAIN;

  const payment = await Payment.create({
    reference,
    type: 'ict_fee',
    status: 'pending',
    amount,
    currency: 'NGN',
    student: student._id,
    payer: { name: fullName(student), email, phone: student.phone || '' },
    institution: student.institution,
    department: student.department,
    level: student.level,
  });

  try {
    const init = await paystack.initialize({
      email,
      amountKobo: amount,
      reference,
      callbackUrl: callbackUrlFor(reference),
      metadata: { type: 'ict_fee', studentId: String(student._id) },
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

module.exports = { initializePayment, quoteIctFee, generateReference, callbackUrlFor };