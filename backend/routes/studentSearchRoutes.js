const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/studentSearchController');

const router = express.Router();

const limiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many searches. Please wait a moment and try again.',
});

const searchSchema = z.object({
  institution: z.string().regex(/^[a-f\d]{24}$/i, 'Choose an institution.'),
  levelKey: z.string().trim().min(1, 'Choose a level.').max(100),
  q: z.string().trim().min(3, 'Type at least 3 characters.').max(100),
});

router.get('/search', limiter, validate(searchSchema, 'query'), c.search);

module.exports = router;