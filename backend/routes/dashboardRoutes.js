const express = require('express');
const { protect } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/dashboardController');

const router = express.Router();

const limiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please wait a moment and try again.',
});

// Both roles. The money cards are only included for the Super Admin.
router.get('/', limiter, protect, c.overview);

module.exports = router;