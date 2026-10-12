const mongoose = require('mongoose');
const { normKey } = require('../services/normalize');

const institutionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameKey: { type: String, unique: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

institutionSchema.pre('validate', function () {
  if (this.name) this.nameKey = normKey(this.name);
});

module.exports = mongoose.model('Institution', institutionSchema, 'institutions');