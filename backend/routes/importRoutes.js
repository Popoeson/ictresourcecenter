const express = require('express');
const multer = require('multer');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const { AppError } = require('../middleware/errorHandler');
const c = require('../controllers/importController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function receiveFile(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError('The file is too large. The maximum is 5 MB.', 400, 'FILE_TOO_LARGE'));
    }
    return next(new AppError('The file could not be read.', 400, 'UPLOAD_ERROR'));
  });
}

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.') });

// Super Admin only
router.use(protect, requireRole('superadmin'));

router.get('/template', c.template);
router.get('/batches', c.listBatches);
router.post('/', receiveFile, c.importStudents);
router.get('/:id/errors', validate(idParams, 'params'), c.errorFile);

module.exports = router;