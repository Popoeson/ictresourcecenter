const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/tokenAdminController');

const router = express.Router();

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.') });

const manualSchema = z.object({
  studentId: z.string().regex(/^[a-f\d]{24}$/i, 'Choose a student.'),
  files: z.number().int('Choose a whole number of files.').min(1, 'Choose at least 1 file.').max(10, 'Choose 10 files or fewer.'),
});

// Super Admin only
router.use(protect, requireRole('superadmin'));

router.get('/', c.list);
router.post('/manual', validate(manualSchema), c.createManual);
router.post('/:id/reissue', validate(idParams, 'params'), c.reissue);

module.exports = router;