const { Payment, Level, Price, HandoutFile, Setting } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const paystack = require('./paystackProvider');
const { generateReference, callbackUrlFor } = require('./paymentService');

const PDF_MISSING =
  'The PDF for your department and level is not available yet. Please contact your course lecturer.';
const PDF_MISSING_HYBRID =
  'The PDF for your department and level is not available yet. You can buy a hard copy for pickup.';

// The buyer picks institution, department and level. They must belong together.
async function resolveChoice({ institution, department, level }) {
  const lvl = await Level.findOne({ _id: level, isActive: true })
    .populate('institution', 'name isActive')
    .populate('department', 'name isActive');
  const ok =
    lvl &&
    lvl.institution &&
    lvl.department &&
    lvl.institution.isActive &&
    lvl.department.isActive &&
    String(lvl.institution._id) === String(institution) &&
    String(lvl.department._id) === String(department);
  if (!ok) throw new AppError('Choose a valid institution, department and level.', 400, 'BAD_CHOICE');
  return lvl;
}

// The handout price is set per institution and level name and applies to every department.
async function handoutPriceFor(lvl) {
  const price = await Price.findOne({ institution: lvl.institution._id, levelKey: lvl.levelKey }).select('handoutPrice');
  if (!price || !Number.isInteger(price.handoutPrice) || price.handoutPrice <= 0) {
    throw new AppError('The handout price has not been set yet. Please contact your course lecturer.', 400, 'PRICE_NOT_SET');
  }
  return price.handoutPrice;
}

async function deliveryMode() {
  const s = await Setting.findOne({ key: 'global' }).select('handoutDeliveryMode').lean();
  return (s && s.handoutDeliveryMode) || 'hybrid';
}

async function pdfExists(lvl) {
  return !!(await HandoutFile.exists({
    institution: lvl.institution._id,
    department: lvl.department._id,
    level: lvl._id,
    isActive: true,
  }));
}

// Which delivery options this buyer can choose
function optionsFor(mode, pdfAvailable) {
  if (mode === 'pdf') return pdfAvailable ? ['pdf'] : [];
  if (mode === 'pickup') return ['pickup'];
  return pdfAvailable ? ['pdf', 'pickup'] : ['pickup'];
}

async function work(choice) {
  const lvl = await resolveChoice(choice);
  const amount = await handoutPriceFor(lvl);
  const mode = await deliveryMode();
  const pdfAvailable = await pdfExists(lvl);
  return { lvl, amount, mode, pdfAvailable, options: optionsFor(mode, pdfAvailable) };
}

// Shown before paying. Everything is worked out here, never in the browser.
async function quote(choice) {
  const w = await work(choice);
  const blocked = w.options.length === 0;
  let message = null;
  if (blocked) message = PDF_MISSING;
  else if (w.mode === 'hybrid' && !w.pdfAvailable) message = PDF_MISSING_HYBRID;

  return {
    amount: w.amount,
    currency: 'NGN',
    mode: w.mode,
    options: w.options,
    pdfAvailable: w.pdfAvailable,
    blocked,
    message,
    institution: w.lvl.institution.name,
    department: w.lvl.department.name,
    level: w.lvl.name,
  };
}

// Creates the pending payment and returns the Paystack link
async function initializeHandout({ name, phone, email, institution, department, level, delivery }) {
  const w = await work({ institution, department, level });

  if (!w.options.length) throw new AppError(PDF_MISSING, 400, 'PDF_NOT_AVAILABLE');
  if (!w.options.includes(delivery)) {
    throw new AppError('Choose a delivery option that is available for your level.', 400, 'BAD_DELIVERY');
  }

  const reference = generateReference();
  const cleanEmail = String(email).trim().toLowerCase();

  const payment = await Payment.create({
    reference,
    type: 'handout',
    status: 'pending',
    amount: w.amount,
    currency: 'NGN',
    student: null,
    payer: { name: String(name).replace(/\s+/g, ' ').trim(), email: cleanEmail, phone: String(phone).trim() },
    institution: w.lvl.institution._id,
    department: w.lvl.department._id,
    level: w.lvl._id,
    details: { delivery },
  });

  try {
    const init = await paystack.initialize({
      email: cleanEmail,
      amountKobo: w.amount,
      reference,
      callbackUrl: callbackUrlFor(reference),
      metadata: { type: 'handout', delivery },
      split: null,
    });
    payment.providerData = { accessCode: init.accessCode, authorizationUrl: init.authorizationUrl };
    await payment.save();
    return { reference, authorizationUrl: init.authorizationUrl, amount: w.amount };
  } catch (err) {
    payment.status = 'failed';
    payment.flagReason = 'Could not start the payment with Paystack.';
    await payment.save();
    throw err;
  }
}

module.exports = { quote, initializeHandout };