const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

// Extra handouts (not the ICT handout). Many can exist per institution, department and level.
// The price is kept on the handout itself, in kobo.
const extraHandoutSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    titleKey: { type: String, required: true },
    institution: { type: ObjectId, ref: 'Institution', required: true },
    department: { type: ObjectId, ref: 'Department', required: true },
    level: { type: ObjectId, ref: 'Level', required: true },
    price: { type: Number, required: true, min: 1 },
    file: {
      publicId: { type: String, required: true },
      resourceType: { type: String, required: true },
      deliveryType: { type: String, default: 'authenticated' },
      bytes: { type: Number },
      originalName: { type: String },
    },
    isActive: { type: Boolean, default: true },
    uploadedBy: { type: ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

// No two active handouts with the same title for the same institution, department and level
extraHandoutSchema.index(
  { institution: 1, department: 1, level: 1, titleKey: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);
extraHandoutSchema.index({ institution: 1, level: 1, isActive: 1 });

module.exports = mongoose.model('ExtraHandout', extraHandoutSchema, 'extraHandouts');