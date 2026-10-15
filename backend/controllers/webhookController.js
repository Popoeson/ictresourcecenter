const { WebhookEvent } = require('../models');
const paystack = require('../services/paystackProvider');
const { verifyAndFulfil } = require('../services/fulfilmentService');
const logger = require('../config/logger');

const OK = { success: true, data: { received: true } };

async function mark(id, status) {
  await WebhookEvent.updateOne({ _id: id }, { $set: { status, processedAt: new Date() } });
}

// Paystack calls this directly (not through Vercel). The body arrives raw so the signature can be checked.
async function paystackWebhook(req, res) {
  const evt = paystack.parseWebhook(req.body, req.headers['x-paystack-signature']);
  if (!evt) {
    logger.warn('Paystack webhook rejected: invalid signature');
    return res.status(401).json({ success: false, message: 'Invalid signature.', code: 'BAD_SIGNATURE' });
  }

  const eventKey = evt.event + ':' + (evt.reference || '');
  try {
    const record = await WebhookEvent.findOneAndUpdate(
      { eventKey },
      { $setOnInsert: { event: evt.event, reference: evt.reference, status: 'received', receivedAt: new Date() } },
      { upsert: true, new: true }
    );

    // A repeat delivery of something already handled changes nothing
    if (record.status !== 'received') return res.json(OK);

    if (evt.event !== 'charge.success' || !evt.reference) {
      await mark(record._id, 'ignored');
      return res.json(OK);
    }

    let result;
    try {
      // Same one-time fulfilment as the callback page. It also re-checks the payment with Paystack.
      result = await verifyAndFulfil(evt.reference, 'webhook');
    } catch (err) {
      if (err.code === 'NOT_FOUND') {
        await mark(record._id, 'ignored');
        return res.json(OK);
      }
      throw err;
    }

    if (result.outcome === 'processing') {
      // Could not confirm with Paystack right now. A non-200 reply makes Paystack send it again.
      return res.status(503).json({ success: false, message: 'Try again shortly.', code: 'RETRY' });
    }

    await mark(record._id, 'processed');
    logger.info({ reference: evt.reference, outcome: result.outcome }, 'Webhook handled');
    return res.json(OK);
  } catch (err) {
    if (err && err.code === 11000) return res.json(OK); // another delivery is being handled
    logger.error({ reference: evt.reference, err: err.message }, 'Webhook failed');
    return res.status(500).json({ success: false, message: 'Webhook failed.', code: 'ERROR' });
  }
}

module.exports = { paystackWebhook };