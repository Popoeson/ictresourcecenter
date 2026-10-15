const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/submissionController');

const router = express.Router();

// Limits guessing of tokens
const unlockLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const unlockSchema = z.object({
  token: z.string().trim().min(1, 'Enter your token.').max(30, 'That token is not valid.'),
});

router.post('/unlock', unlockLimiter, validate(unlockSchema), c.unlock);

module.exports = router;