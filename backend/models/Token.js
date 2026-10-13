const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const tokenSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    student: { type: ObjectId, ref: 'Student', required: true },
    payment: { type: ObjectId, ref: 'Payment', default: null },
    source: { type: String, enum: ['payment', 'manual', 'reissue'], required: true },
    adminVisible: { type: Boolean, default: false },
    filesAllowed: { type: Number, required: true, min: 1 },
    filesUploaded: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['active', 'in_progress', 'used', 'expired', 'revoked'],
      default: 'active',
    },
    expiresAt: { type: Date, required: true },
    claimedAt: { type: Date, default: null },
    usedAt: { type: Date, default: null },
    createdBy: { type: ObjectId, ref: 'Admin', default: null },
    reissuedFrom: { type: ObjectId, ref: 'Token', default: null },
  },
  { timestamps: true }
);

// Only payment tokens are visible to the Admin role. Manual and reissued tokens never are.
tokenSchema.pre('validate', function () {
  if (this.isNew) this.adminVisible = this.source === 'payment';
});

tokenSchema.index({ student: 1, createdAt: -1 });
tokenSchema.index({ status: 1, expiresAt: 1 });

module.exports = mongoose.model('Token', tokenSchema, 'tokens');