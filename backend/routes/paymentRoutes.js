const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/paymentController');

const router = express.Router();

const initLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many payment attempts. Please wait a minute and try again.',
});
const verifyLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please wait a moment and try again.',
});

const initSchema = z.object({
  type: z.enum(['ict_fee', 'assignment', 'handout', 'departmental_fee']),
  studentId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid student.'),
  files: z.number().int().min(1).max(100).optional(),
});
const refParams = z.object({
  reference: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Invalid reference.'),
});

router.post('/initialize', initLimiter, validate(initSchema), c.initialize);
router.get('/verify/:reference', verifyLimiter, validate(refParams, 'params'), c.verify);

module.exports = router;