const { Payment } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { ensureReceiptNumber } = require('../services/fulfilmentService');
const { buildReceipt } = require('../services/receiptService');
const qr = require('../services/qrService');

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
        const qrPng = await qr.pngBuffer(qr.verifyUrl(payment.reference), 300);
    const doc = buildReceipt(payment, qrPng);
    doc.pipe(res);
    doc.end();
  } catch (err) {
    next(err);
  }
}

// The QR image for a paid reference, shown on the callback page
async function qrImage(req, res, next) {
  try {
    const payment = await Payment.findOne({ reference: req.params.reference, status: 'success' }).select('reference');
    if (!payment) throw new AppError('Receipt not found.', 404, 'NOT_FOUND');
    const png = await qr.pngBuffer(qr.verifyUrl(payment.reference), 360);
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.send(png);
  } catch (err) {
    next(err);
  }
}

// Public check used by the page the QR code opens. Returns the minimum needed to compare with the person presenting it.
async function verify(req, res, next) {
  try {
    const p = await Payment.findOne({ reference: req.params.reference, status: 'success' })
      .populate('institution', 'name')
      .populate('level', 'name');
    if (!p) throw new AppError('This receipt could not be verified.', 404, 'NOT_FOUND');
    res.json({
      success: true,
      data: {
        valid: true,
        receiptNumber: p.receiptNumber || null,
        reference: p.reference,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        payerName: (p.payer && p.payer.name) || '',
        institution: p.institution ? p.institution.name : '',
        level: p.level ? p.level.name : '',
        paidAt: (p.providerData && p.providerData.paidAt) || p.confirmedAt || null,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { download, qrImage, verify };