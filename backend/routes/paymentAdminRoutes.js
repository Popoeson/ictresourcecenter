const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/paymentAdminController');

const router = express.Router();

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date.');

const listSchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  q: z.string().max(100).optional(),
  type: z.enum(['ict_fee', 'assignment', 'handout']).optional(),
  status: z.enum(['pending', 'success', 'failed', 'abandoned', 'flagged']).optional(),
  institution: objectId.optional(),
  department: objectId.optional(),
  level: objectId.optional(),
  from: day.optional(),
  to: day.optional(),
});
const idParams = z.object({ id: objectId });

// Admin and Super Admin can view. Only the Super Admin can re-verify.
router.use(protect);
router.get('/', validate(listSchema, 'query'), c.list);
router.post('/:id/reverify', requireRole('superadmin'), validate(idParams, 'params'), c.reverify);

module.exports = router;