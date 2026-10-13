const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const c = require('../controllers/lookupController');

const router = express.Router();
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');

router.get('/institutions', c.institutions);
router.get('/departments', validate(z.object({ institution: objectId }), 'query'), c.departments);
router.get(
  '/levels',
  validate(
    z
      .object({ department: objectId.optional(), institution: objectId.optional() })
      .refine((d) => d.department || d.institution, 'Choose an institution or a department.'),
    'query'
  ),
  c.levels
);

module.exports = router;