const { Payment, Level, Setting } = require('../models');
const ExtraHandout = require('../models/ExtraHandout');
const { AppError } = require('../middleware/errorHandler');
const paystack = require('./paystackProvider');
const { generateReference, callbackUrlFor } = require('./paymentService');

// Buying an extra (non-ICT) handout. The price always comes from the handout record, never from the browser.

async function deliveryMode() {
  const s = await Setting.findOne({ key: 'global' }).select('handoutDeliveryMode').lean();
  return (s && s.handoutDeliveryMode) || 'hybrid';
}

// An extra handout always has its PDF, so only the global mode decides the options
function optionsFor(mode) {
  if (mode === 'pdf') return ['pdf'];
  if (mode === 'pickup') return ['pickup'];
  return ['pdf', 'pickup'];
}

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

async function loadHandout(id) {
  const h = await ExtraHandout.findOne({ _id: id, isActive: true })
    .populate('institution', 'name isActive')
    .populate('department', 'name isActive')
    .populate('level', 'name isActive');
  const ok =
    h &&
    h.institution &&
    h.department &&
    h.level &&
    h.institution.isActive &&
    h.department.isActive &&
    h.level.isActive;
  if (!ok) throw new AppError('This handout is not available.', 404, 'NOT_FOUND');
  return h;
}

// The handouts a buyer can choose for their institution, department and level
async function listAvailable(choice) {
  const lvl = await resolveChoice(choice);
  const mode = await deliveryMode();
  const items = await ExtraHandout.find({
    institution: lvl.institution._id,
    department: lvl.department._id,
    level: lvl._id,
    isActive: true,
  })
    .select('title price')
    .sort({ title: 1 })
    .lean();

  return {
    mode,
    options: optionsFor(mode),
    items: items.map((h) => ({ id: String(h._id), title: h.title, price: h.price })),
  };
}

// Shown before paying
async function quote(handoutId) {
  const h = await loadHandout(handoutId);
  const mode = await deliveryMode();
  return {
    id: String(h._id),
    title: h.title,
    amount: h.price,
    currency: 'NGN',
    mode,
    options: optionsFor(mode),
    institution: h.institution.name,
    department: h.department.name,
    level: h.level.name,
  };
}

// Creates the pending payment and returns the Paystack link
async function initializeExtraHandout({ name, phone, email, handout, delivery }) {
  const h = await loadHandout(handout);
  const mode = await deliveryMode();
  if (!optionsFor(mode).includes(delivery)) {
    throw new AppError('Choose a delivery option that is available.', 400, 'BAD_DELIVERY');
  }

  const reference = generateReference();
  const cleanEmail = String(email).trim().toLowerCase();

  const payment = await Payment.create({
    reference,
    type: 'handout',
    status: 'pending',
    amount: h.price,
    currency: 'NGN',
    student: null,
    payer: { name: String(name).replace(/\s+/g, ' ').trim(), email: cleanEmail, phone: String(phone).trim() },
    institution: h.institution._id,
    department: h.department._id,
    level: h.level._id,
    details: { delivery, extraHandout: h._id },
  });

  try {
    const init = await paystack.initialize({
      email: cleanEmail,
      amountKobo: h.price,
      reference,
      callbackUrl: callbackUrlFor(reference),
      metadata: { type: 'handout', delivery, extraHandout: String(h._id) },
      split: null,
    });
    payment.providerData = { accessCode: init.accessCode, authorizationUrl: init.authorizationUrl };
    await payment.save();
    return { reference, authorizationUrl: init.authorizationUrl, amount: h.price };
  } catch (err) {
    payment.status = 'failed';
    payment.flagReason = 'Could not start the payment with Paystack.';
    await payment.save();
    throw err;
  }
}

module.exports = { listAvailable, quote, initializeExtraHandout };