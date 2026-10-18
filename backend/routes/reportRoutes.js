const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/reportController');

const router = express.Router();

const tabParams = z.object({ tab: z.enum(['students', 'submissions', 'payments', 'handouts']) });

const showLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests. Please wait a moment and try again.',
});
const exportLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many exports. Please wait a minute and try again.',
});

// Both roles. The reports never include tokens, flag reasons or other Super Admin details.
router.use(protect);

router.get('/:tab', showLimiter, validate(tabParams, 'params'), c.show);
router.get('/:tab/export', exportLimiter, validate(tabParams, 'params'), c.exportReport);

module.exports = router;