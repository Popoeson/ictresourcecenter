const QRCode = require('qrcode');
const { env } = require('../config/env');

// The QR code holds a link to the public verification page on the student site.
function verifyUrl(reference) {
  return env.frontendUrl + '/verify-receipt.html?reference=' + encodeURIComponent(reference);
}

function pngBuffer(text, width) {
  return QRCode.toBuffer(text, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: width || 300,
  });
}

module.exports = { verifyUrl, pngBuffer };