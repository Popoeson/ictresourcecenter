const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/priceController');
const a = require('../controllers/assignmentPriceController');

const router = express.Router();

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.');
const kobo = z
  .number({ invalid_type_error: 'Enter the amount in kobo.' })
  .int('Enter a whole number of kobo.')
  .min(1, 'Amount must be greater than zero.')
  .nullable()
  .optional();

const saveSchema = z
  .object({
    institution: objectId,
    levelKey: z.string().trim().min(1).max(120),
    ictFee: kobo,
    handoutPrice: kobo,
  })
  .refine(
    (d) => d.ictFee !== undefined || d.handoutPrice !== undefined,
    'Nothing to update.'
  );

router.use(protect);

// Admins and Super Admins may read. Only the Super Admin may write.
router.get('/', validate(z.object({ institution: objectId.optional() }), 'query'), c.listPrices);
router.put('/', requireRole('superadmin'), validate(saveSchema), c.savePrice);
router.delete('/:id', requireRole('superadmin'), validate(z.object({ id: objectId }), 'params'), c.deletePrice);

// Assignment price per file, per institution, department and level
const assignmentSchema = z
  .object({ level: objectId, assignmentPerFile: kobo })
  .refine((d) => d.assignmentPerFile !== undefined, 'Enter the price.');

router.get('/assignment', validate(z.object({ institution: objectId.optional() }), 'query'), a.listAssignmentPrices);
router.put('/assignment', requireRole('superadmin'), validate(assignmentSchema), a.saveAssignmentPrice);

module.exports = router;