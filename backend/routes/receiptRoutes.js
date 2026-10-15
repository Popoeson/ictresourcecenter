const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/receiptController');

const router = express.Router();

const limiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please wait a moment and try again.',
});

const refParams = z.object({
  reference: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Invalid reference.'),
});

router.get('/:reference', limiter, validate(refParams, 'params'), c.download);

module.exports = router;