const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect, requireRole } = require('../middleware/auth');
const c = require('../controllers/duesSettingsController');

const router = express.Router();

const schema = z
  .object({
    maxInstalments: z
      .number({ invalid_type_error: 'Enter a whole number.' })
      .int('Enter a whole number.')
      .min(1, 'At least 1.')
      .max(10, 'At most 10.')
      .optional(),
    minInstalment: z
      .number({ invalid_type_error: 'Enter the amount in kobo.' })
      .int('Enter a whole number of kobo.')
      .min(0, 'Cannot be negative.')
      .optional(),
  })
  .refine((d) => d.maxInstalments !== undefined || d.minInstalment !== undefined, 'Nothing to update.');

router.use(protect);

// Both roles can read. Only the Super Admin can change.
router.get('/', c.getSettings);
router.put('/', requireRole('superadmin'), validate(schema), c.updateSettings);

module.exports = router;