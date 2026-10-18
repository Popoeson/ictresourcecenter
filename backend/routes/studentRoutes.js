const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/studentController');

const router = express.Router();

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');
const idParams = z.object({ id: objectId });
const superOnly = requireRole('superadmin');

const nameField = z.string().trim().min(1, 'Enter a name.').max(80);
const emailField = z.union([z.literal(''), z.string().trim().email('Enter a valid email.').max(200)]);
const phoneField = z.string().trim().max(30);

const listQuery = z.object({
  institution: objectId.optional(),
  department: objectId.optional(),
  level: objectId.optional(),
  levelKey: z.string().trim().max(120).optional(),
  ictFeePaid: z.enum(['true', 'false']).optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

const createSchema = z
  .object({
    surname: nameField,
    firstname: nameField,
    othername: z.string().trim().max(80).optional(),
    phone: phoneField.optional(),
    email: emailField.optional(),
    level: objectId,
  })
  .refine((d) => d.email || d.phone, 'Enter an email or a phone number.');

const updateSchema = z
  .object({
    surname: nameField.optional(),
    firstname: nameField.optional(),
    othername: z.string().trim().max(80).optional(),
    phone: phoneField.optional(),
    email: emailField.optional(),
    level: objectId.optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), 'Nothing to update.');

router.use(protect);

// Admins and Super Admins may read and add students. Only the Super Admin may edit or delete.

router.get('/', validate(listQuery, 'query'), c.listStudents);
router.get('/:id', validate(idParams, 'params'), c.getStudent);
router.post('/', validate(createSchema), c.createStudent);
router.patch('/:id', superOnly, validate(idParams, 'params'), validate(updateSchema), c.updateStudent);
router.delete('/:id', superOnly, validate(idParams, 'params'), c.deleteStudent);

module.exports = router;