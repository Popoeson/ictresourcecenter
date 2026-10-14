const mongoose = require('mongoose');
const { normKey } = require('../services/normalize');

const levelSchema = new mongoose.Schema(
  {
    institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    name: { type: String, required: true, trim: true },
        levelKey: { type: String },
    // Assignment price per file, in kobo. Null means not set yet.
    assignmentPerFile: {
      type: Number,
      default: null,
      min: 0,
      validate: {
        validator: (v) => v === null || Number.isInteger(v),
        message: 'Amount must be a whole number of kobo',
      },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

levelSchema.pre('validate', function () {
  if (this.name) this.levelKey = normKey(this.name);
});

levelSchema.index({ department: 1, levelKey: 1 }, { unique: true });
levelSchema.index({ institution: 1, levelKey: 1 });

module.exports = mongoose.model('Level', levelSchema, 'levels');