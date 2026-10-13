const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/structureController');

const router = express.Router();

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');
const idParams = z.object({ id: objectId });
const name = z.string().trim().min(1, 'Enter a name.').max(120);

const updateSchema = z
  .object({ name: name.optional(), isActive: z.boolean().optional() })
  .refine((d) => d.name !== undefined || d.isActive !== undefined, 'Nothing to update.');

const superOnly = requireRole('superadmin');

// Admins and Super Admins may read. Only the Super Admin may write.
router.use(protect);

router.get('/institutions', c.listInstitutions);
router.post('/institutions', superOnly, validate(z.object({ name })), c.createInstitution);
router.patch('/institutions/:id', superOnly, validate(idParams, 'params'), validate(updateSchema), c.updateInstitution);
router.delete('/institutions/:id', superOnly, validate(idParams, 'params'), c.deleteInstitution);

router.get('/departments', validate(z.object({ institution: objectId.optional() }), 'query'), c.listDepartments);
router.post('/departments', superOnly, validate(z.object({ institution: objectId, name })), c.createDepartment);
router.patch('/departments/:id', superOnly, validate(idParams, 'params'), validate(updateSchema), c.updateDepartment);
router.delete('/departments/:id', superOnly, validate(idParams, 'params'), c.deleteDepartment);

router.get(
  '/levels',
  validate(z.object({ department: objectId.optional(), institution: objectId.optional() }), 'query'),
  c.listLevels
);
router.post('/levels', superOnly, validate(z.object({ department: objectId, name })), c.createLevel);
router.patch('/levels/:id', superOnly, validate(idParams, 'params'), validate(updateSchema), c.updateLevel);
router.delete('/levels/:id', superOnly, validate(idParams, 'params'), c.deleteLevel);

module.exports = router;