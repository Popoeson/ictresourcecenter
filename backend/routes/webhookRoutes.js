const express = require('express');
const c = require('../controllers/webhookController');

const router = express.Router();

// The body must stay raw (a Buffer) so the signature can be checked.
router.post('/', express.raw({ type: '*/*', limit: '100kb' }), c.paystackWebhook);

module.exports = router;