const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const c = require('../controllers/handoutAdminController');

const router = express.Router();

// The PDF is held in memory while it uploads, so the limits protect the free plan
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: c.MAX_HANDOUT_BYTES, files: 1, fields: 5 },
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

const modeSchema = z.object({ deliveryMode: z.enum(['pdf', 'pickup', 'hybrid'], { message: 'Choose a delivery mode.' }) });

router.use(protect);

// Both roles can read
router.get('/settings', c.getSettings);
router.get('/files', c.listFiles);

// Super Admin only. The role check comes before the upload is read.
router.put('/settings', requireRole('superadmin'), validate(modeSchema), c.updateSettings);
router.post('/files', requireRole('superadmin'), receiveFile, c.upload);

module.exports = router;