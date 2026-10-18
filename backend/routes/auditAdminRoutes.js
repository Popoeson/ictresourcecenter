const express = require('express');
const { protect, requireRole } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/auditAdminController');

const router = express.Router();

const limiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests. Please wait a moment and try again.',
});

// Super Admin only, read only
router.use(protect, requireRole('superadmin'));

router.get('/', limiter, c.list);
router.get('/filters', limiter, c.filters);

module.exports = router;