const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/paymentController');

const router = express.Router();

const limiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please wait a moment and try again.',
});

const quoteSchema = z.object({
  type: z.enum(['ict_fee', 'assignment', 'handout', 'departmental_fee']),
  studentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid student.'),
  files: z.string().regex(/^\d{1,3}$/, 'Enter a valid number of files.').optional(),
});

router.get('/quote', limiter, validate(quoteSchema, 'query'), c.quote);

module.exports = router;