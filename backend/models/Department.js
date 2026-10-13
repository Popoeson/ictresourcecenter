const mongoose = require('mongoose');
const { normKey } = require('../services/normalize');

const departmentSchema = new mongoose.Schema(
  {
    institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
    name: { type: String, required: true, trim: true },
    nameKey: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

departmentSchema.pre('validate', function () {
  if (this.name) this.nameKey = normKey(this.name);
});

departmentSchema.index({ institution: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema, 'departments');