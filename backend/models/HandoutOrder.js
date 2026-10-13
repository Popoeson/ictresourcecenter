const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const handoutOrderSchema = new mongoose.Schema(
  {
    payment: { type: ObjectId, ref: 'Payment', required: true, unique: true },
    buyer: {
      name: { type: String, required: true },
      phone: { type: String },
      email: { type: String },
    },
    institution: { type: ObjectId, ref: 'Institution', required: true },
    department: { type: ObjectId, ref: 'Department', required: true },
    level: { type: ObjectId, ref: 'Level', required: true },
    delivery: { type: String, enum: ['pdf', 'pickup'], required: true },
    handoutFile: { type: ObjectId, ref: 'HandoutFile', default: null },
    pickupCode: { type: String, unique: true, sparse: true },
    // Set only for pickup orders
    pickup: {
      status: { type: String, enum: ['pending', 'collected'] },
      collectedAt: { type: Date },
      collectedBy: { type: ObjectId, ref: 'Admin' },
    },
    isStudent: { type: Boolean, default: false },
    matchedStudent: { type: ObjectId, ref: 'Student', default: null },
    matchedBy: { type: String, enum: ['email', 'phone', null], default: null },
  },
  { timestamps: true }
);

handoutOrderSchema.index({ institution: 1, level: 1, createdAt: -1 });
handoutOrderSchema.index({ 'pickup.status': 1 });

module.exports = mongoose.model('HandoutOrder', handoutOrderSchema, 'handoutOrders');