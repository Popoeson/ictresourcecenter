const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const { authenticate, protect, requireRole } = require('../middleware/auth');
const { login, logout, me, changePassword } = require('../controllers/authController');

const router = express.Router();

const loginLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many login attempts. Please try again later.',
});

const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email.').max(200),
  password: z.string().min(1, 'Enter your password.').max(200),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password.').max(200),
  newPassword: z.string().min(10, 'Use at least 10 characters.').max(128),
});

router.post('/login', loginLimiter, validate(loginSchema), login);
router.post('/logout', logout);
router.get('/me', authenticate, me);
router.post('/change-password', authenticate, validate(changePasswordSchema), changePassword);

// TEMPORARY: proves role checks work. Remove in Phase 8.
router.get('/_super-only', protect, requireRole('superadmin'), (req, res) => {
  res.json({ success: true, data: { ok: true } });
});

module.exports = router;