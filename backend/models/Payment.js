const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const paymentSchema = new mongoose.Schema(
  {
    reference: { type: String, required: true, unique: true },
    type: { type: String, enum: ['ict_fee', 'assignment', 'handout'], required: true },
    status: {
      type: String,
      enum: ['pending', 'success', 'failed', 'abandoned', 'flagged'],
      default: 'pending',
    },
    amount: { type: Number, required: true, min: 0 }, // kobo
    currency: { type: String, default: 'NGN' },
    student: { type: ObjectId, ref: 'Student', default: null },
    payer: {
      name: { type: String },
      email: { type: String },
      phone: { type: String },
    },
    institution: { type: ObjectId, ref: 'Institution' },
    department: { type: ObjectId, ref: 'Department' },
    level: { type: ObjectId, ref: 'Level' },
    details: {
      fileCount: { type: Number },
      pricePerFile: { type: Number },
      delivery: { type: String, enum: ['pdf', 'pickup'] },
    },
    // Empty in v1. Future shape: { mode, code, share, bearer }
    split: { type: mongoose.Schema.Types.Mixed, default: null },
    provider: { type: String, default: 'paystack' },
    providerData: {
      accessCode: { type: String },
      authorizationUrl: { type: String },
      transactionId: { type: String },
      channel: { type: String },
      gatewayResponse: { type: String },
      paidAt: { type: Date },
    },
    confirmedAt: { type: Date, default: null },
    confirmedVia: { type: String, enum: ['callback', 'webhook', 'reverify'] },
    flagReason: { type: String },
    receiptNumber: { type: String, unique: true, sparse: true },
  },
  { timestamps: true }
);

// One successful ICT fee per student, even under simultaneous requests
paymentSchema.index(
  { student: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: 'ict_fee', status: 'success' } }
);
paymentSchema.index({ type: 1, status: 1, createdAt: -1 });
paymentSchema.index({ institution: 1, createdAt: -1 });
paymentSchema.index({ student: 1 });

module.exports = mongoose.model('Payment', paymentSchema, 'payments');