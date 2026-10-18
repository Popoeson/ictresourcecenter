const express = require('express');
const { protect } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/exportController');

const router = express.Router();

const exportLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many exports. Please wait a minute and try again.',
});

// Both roles can export. Each export uses the same filters as its list page.
router.use(protect, exportLimiter);

router.get('/students', c.students);
router.get('/payments', c.payments);
router.get('/handout-orders', c.handoutOrders);
router.get('/submissions', c.submissions);

module.exports = router;