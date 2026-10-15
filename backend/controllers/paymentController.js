const paymentService = require('../services/paymentService');
const fulfilmentService = require('../services/fulfilmentService');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// Amount shown before paying. For a paid ICT fee it returns the reference so the receipt can be offered.
async function quote(req, res, next) {
  try {
    send(res, await paymentService.quote({
      type: req.query.type,
      studentId: req.query.studentId,
      files: req.query.files,
    }));
  } catch (err) {
    next(err);
  }
}

async function initialize(req, res, next) {
  try {
    send(res, await paymentService.initializePayment({
      type: req.body.type,
      studentId: req.body.studentId,
      files: req.body.files,
    }), 201);
  } catch (err) {
    next(err);
  }
}

// Used by the callback page. Checks the payment with Paystack by its reference.
async function verify(req, res, next) {
  try {
    send(res, await fulfilmentService.verifyAndFulfil(req.params.reference, 'callback'));
  } catch (err) {
    next(err);
  }
}

module.exports = { quote, initialize, verify };