const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/adminController');

const router = express.Router();

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.') });
const tempPassword = z.string().min(10, 'Use at least 10 characters.').max(128);

const createSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name.').max(100),
  email: z.string().trim().email('Enter a valid email.').max(200),
  temporaryPassword: tempPassword,
});

const updateSchema = z
  .object({
    name: z.string().trim().min(1, 'Enter a name.').max(100).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((d) => d.name !== undefined || d.isActive !== undefined, 'Nothing to update.');

const resetSchema = z.object({ temporaryPassword: tempPassword });

// Super Admin only
router.use(protect, requireRole('superadmin'));

router.get('/', c.listAdmins);
router.post('/', validate(createSchema), c.createAdmin);
router.patch('/:id', validate(idParams, 'params'), validate(updateSchema), c.updateAdmin);
router.post('/:id/reset-password', validate(idParams, 'params'), validate(resetSchema), c.resetPassword);

module.exports = router;