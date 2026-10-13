const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const handoutFileSchema = new mongoose.Schema(
  {
    institution: { type: ObjectId, ref: 'Institution', required: true },
    department: { type: ObjectId, ref: 'Department', required: true },
    level: { type: ObjectId, ref: 'Level', required: true },
    file: {
      publicId: { type: String, required: true },
      resourceType: { type: String, required: true },
      deliveryType: { type: String, default: 'authenticated' },
      bytes: { type: Number },
      originalName: { type: String },
    },
    isActive: { type: Boolean, default: true },
    uploadedBy: { type: ObjectId, ref: 'Admin', default: null },
    replacedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Only one active PDF per institution, department and level
handoutFileSchema.index(
  { institution: 1, department: 1, level: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

module.exports = mongoose.model('HandoutFile', handoutFileSchema, 'handoutFiles');