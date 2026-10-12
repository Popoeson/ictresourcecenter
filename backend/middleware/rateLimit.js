const rateLimit = require('express-rate-limit');

function makeLimiter({ windowMs, max, message }) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message, code: 'RATE_LIMITED' },
  });
}

const apiLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 300,
  message: 'Too many requests. Please slow down.',
});

module.exports = { makeLimiter, apiLimiter };