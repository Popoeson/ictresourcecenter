const mongoose = require('mongoose');

const webhookEventSchema = new mongoose.Schema(
  {
    eventKey: { type: String, required: true, unique: true },
    event: { type: String },
    reference: { type: String },
    status: { type: String, enum: ['received', 'processed', 'ignored'], default: 'received' },
    receivedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

module.exports = mongoose.model('WebhookEvent', webhookEventSchema, 'webhookEvents');