const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const c = require('../controllers/extraHandoutAdminController');

const router = express.Router();

// The PDF is held in memory while it uploads, so the limits protect the free plan
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: c.MAX_HANDOUT_BYTES, files: 1, fields: 6 },
});

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('This file is larger than 10 MB.', 400, 'FILE_TOO_LARGE'));
    }
    return next(new AppError('The file could not be read. Please try again.', 400, 'UPLOAD_ERROR'));
  });
}

const updateSchema = z
  .object({
    title: z.string().trim().min(1, 'Enter a title.').max(120).optional(),
    price: z.number().int().positive('Enter a price above zero.').optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

router.use(protect);

// Both roles can read
router.get('/', c.listExtraHandouts);

// Super Admin only. The role check comes before the upload is read.
router.post('/', requireRole('superadmin'), receiveFile, c.createExtraHandout);
router.patch('/:id', requireRole('superadmin'), validate(updateSchema), c.updateExtraHandout);
router.post('/:id/file', requireRole('superadmin'), receiveFile, c.replaceExtraHandoutFile);

module.exports = router;