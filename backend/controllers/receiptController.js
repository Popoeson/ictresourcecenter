const { Payment } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { ensureReceiptNumber } = require('../services/fulfilmentService');
const { buildReceipt } = require('../services/receiptService');

// Only paid references return a receipt
async function download(req, res, next) {
  try {
    let payment = await Payment.findOne({ reference: req.params.reference, status: 'success' });
    if (!payment) throw new AppError('Receipt not found.', 404, 'NOT_FOUND');

    if (!payment.receiptNumber) await ensureReceiptNumber(payment);
    payment = await Payment.findById(payment._id).populate('institution', 'name').populate('level', 'name');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="receipt-' + payment.receiptNumber + '.pdf"');
    res.setHeader('Cache-Control', 'no-store');
    const doc = buildReceipt(payment);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
}

module.exports = { download };