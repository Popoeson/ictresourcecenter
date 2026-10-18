const express = require('express');
const { protect } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/departmentalAdminController');

const router = express.Router();

const limiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests. Please wait a moment and try again.',
});
const exportLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many exports. Please wait a minute and try again.',
});

// Both roles can view and export. Amounts are changed on the Prices page, which is Super Admin only.
router.use(protect);

router.get('/', limiter, c.list);
router.get('/amounts', limiter, c.amounts);
router.get('/export', exportLimiter, c.exportFile);

module.exports = router;