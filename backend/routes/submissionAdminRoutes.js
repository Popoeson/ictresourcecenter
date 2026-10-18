const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const { makeLimiter } = require('../middleware/rateLimit');
const c = require('../controllers/submissionAdminController');

const router = express.Router();

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.') });

const downloadLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many downloads. Please wait a moment and try again.',
});

router.use(protect);

// Both roles can view and download
router.get('/', c.list);
router.get('/:id/download', downloadLimiter, validate(idParams, 'params'), c.download);

// Super Admin only
const zipLimiter = makeLimiter({
  windowMs: 60 * 1000,
  max: 5,
  message: 'Too many ZIP downloads. Please wait a minute and try again.',
});

router.use(protect);

module.exports = router;