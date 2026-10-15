const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { makeLimiter } = require('../middleware/rateLimit');
const { AppError } = require('../middleware/errorHandler');
const c = require('../controllers/submissionController');

const router = express.Router();

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES = 10;

// Files are held in memory (no local disk), so the size and count limits protect the free plan
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES, fields: 5 },
});

function receiveFiles(req, res, next) {
  upload.array('files', MAX_FILES)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('A file is larger than 5 MB.', 400, 'FILE_TOO_LARGE'));
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
      return next(new AppError('You can upload up to ' + MAX_FILES + ' files at a time.', 400, 'TOO_MANY_FILES'));
    }
    return next(new AppError('The files could not be read. Please try again.', 400, 'UPLOAD_ERROR'));
  });
}

// Limits guessing of tokens
const unlockLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

const uploadLimiter = makeLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many upload attempts. Please wait a few minutes and try again.',
});

const unlockSchema = z.object({
  token: z.string().trim().min(1, 'Enter your token.').max(30, 'That token is not valid.'),
});

router.post('/unlock', unlockLimiter, validate(unlockSchema), c.unlock);
router.post('/upload', uploadLimiter, receiveFiles, c.upload);

module.exports = router;