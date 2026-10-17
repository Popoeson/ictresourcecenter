const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const { phoneKey } = require('../services/normalize');
const c = require('../controllers/handoutController');

const router = express.Router();

const quoteLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many requests. Please wait a moment and try again.',
});
const initLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many payment attempts. Please wait a minute and try again.',
});

const id = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid choice.');

const quoteSchema = z.object({ institution: id, department: id, level: id });

const initSchema = z.object({
  name: z.string().trim().min(3, 'Enter your full name.').max(120),
  phone: z
    .string()
    .trim()
    .max(25)
    .refine((v) => {
      const k = phoneKey(v);
      return k.length >= 10 && k.length <= 15;
    }, 'Enter a valid phone number.'),
  email: z.string().trim().email('Enter a valid email.').max(200),
  institution: id,
  department: id,
  level: id,
  delivery: z.enum(['pdf', 'pickup']),
});

const refParams = z.object({
  reference: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/, 'Invalid reference.'),
});
const linkLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: 'Too many requests. Please wait a moment and try again.',
});

router.get('/quote', quoteLimiter, validate(quoteSchema, 'query'), c.quote);
router.get('/link/:reference', linkLimiter, validate(refParams, 'params'), c.link);
router.post('/initialize', initLimiter, validate(initSchema), c.initialize);

module.exports = router;