const mongoose = require('mongoose');
const { normKey } = require('../services/normalize');

// Whole kobo or null (null means "not set yet")
const koboField = {
  type: Number,
  default: null,
  min: 0,
  validate: {
    validator: (v) => v === null || Number.isInteger(v),
    message: 'Amount must be a whole number of kobo',
  },
};

const priceSchema = new mongoose.Schema(
  {
    institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
    levelKey: { type: String, required: true },
    levelLabel: { type: String, trim: true },
    ictFee: koboField,
    assignmentPerFile: koboField,
    handoutPrice: koboField,
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  },
  { timestamps: true }
);

priceSchema.pre('validate', function () {
  if (this.levelKey) this.levelKey = normKey(this.levelKey);
});

priceSchema.index({ institution: 1, levelKey: 1 }, { unique: true });

module.exports = mongoose.model('Price', priceSchema, 'prices');