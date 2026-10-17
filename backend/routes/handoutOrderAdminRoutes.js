const express = require('express');
const { z } = require('zod');
const { validate } = require('../middleware/validate');
const { protect } = require('../middleware/auth');
const c = require('../controllers/handoutOrderAdminController');

const router = express.Router();

const idParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id.') });

// Both roles. Marking an order collected is allowed for the Admin role by the project owner's decision.
router.use(protect);

router.get('/', c.list);
router.post('/:id/collect', validate(idParams, 'params'), c.collect);

module.exports = router;