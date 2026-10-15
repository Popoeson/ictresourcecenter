const PDFDocument = require('pdfkit');

const TYPE_LABEL = {
  ict_fee: 'ICT course fee',
  assignment: 'Assignment submission',
  handout: 'Course handout',
};

// The PDF's built-in font has no naira sign, so amounts are written as "NGN".
function money(kobo) {
  return 'NGN ' + (kobo / 100).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dateText(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' });
}

function row(doc, label, value) {
  const y = doc.y;
  doc.font('Helvetica').fontSize(10).fillColor('#6B6B6B').text(label, 40, y, { width: 110 });
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#1B1B1B').text(String(value || '-'), 160, y, {
    width: doc.page.width - 200,
  });
  doc.moveDown(0.6);
}

// payment: a successful payment with institution and level populated (name only)
function buildReceipt(payment) {
  const doc = new PDFDocument({
    size: 'A5',
    margin: 40,
    info: { Title: 'Receipt ' + payment.receiptNumber, Author: 'ICT Course Portal' },
  });

  doc.font('Helvetica-Bold').fontSize(18).fillColor('#1B1B1B').text('ICT Course Portal', 40, 40);
  doc.font('Helvetica').fontSize(12).fillColor('#6B6B6B').text('Payment receipt');
  doc.moveDown(0.8);
  doc.moveTo(40, doc.y).lineTo(doc.page.width - 40, doc.y).strokeColor('#DCDCDC').stroke();
  doc.moveDown(1);

  row(doc, 'Receipt number', payment.receiptNumber);
  row(doc, 'Date', dateText(payment.confirmedAt));
  row(doc, 'Received from', payment.payer && payment.payer.name);
  row(doc, 'Institution', payment.institution && payment.institution.name);
  row(doc, 'Level', payment.level && payment.level.name);
  row(doc, 'Payment for', TYPE_LABEL[payment.type] || payment.type);

  const d = payment.details || {};
  if (payment.type === 'assignment' && d.fileCount) {
    row(doc, 'Files', d.fileCount + ' x ' + money(d.pricePerFile || 0));
  }

  row(doc, 'Amount paid', money(payment.amount));
  row(doc, 'Reference', payment.reference);

  doc.moveDown(1);
  doc.font('Helvetica').fontSize(9).fillColor('#6B6B6B').text('Keep this receipt for your records.', 40);
  return doc;
}

module.exports = { buildReceipt };