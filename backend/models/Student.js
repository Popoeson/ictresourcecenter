const mongoose = require('mongoose');
const { normKey, phoneKey } = require('../services/normalize');

const studentSchema = new mongoose.Schema(
  {
    surname: { type: String, required: true, trim: true },
    firstname: { type: String, required: true, trim: true },
    othername: { type: String, trim: true, default: '' },
    searchTokens: { type: [String], default: [] },
    institution: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
    department: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
    level: { type: mongoose.Schema.Types.ObjectId, ref: 'Level', required: true },
    levelKey: { type: String, required: true },
    phone: { type: String, trim: true },
    phoneKey: { type: String },
    email: { type: String, trim: true },
    emailKey: { type: String },
    ictFeePaid: { type: Boolean, default: false },
    ictFeePaidAt: { type: Date, default: null },
    ictFeePayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    source: { type: String, enum: ['import', 'manual'], default: 'import' },
    importBatch: { type: mongoose.Schema.Types.ObjectId, ref: 'ImportBatch', default: null },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Keep the matching fields in step with the typed values (works with doc.save())
studentSchema.pre('validate', function () {
  const words = normKey([this.surname, this.firstname, this.othername].join(' '))
    .split(' ')
    .filter(Boolean);
  this.searchTokens = Array.from(new Set(words));

  const p = phoneKey(this.phone);
  this.phoneKey = p || undefined;

  const e = this.email ? normKey(this.email) : '';
  this.emailKey = e || undefined;
});

studentSchema.index({ institution: 1, level: 1, searchTokens: 1 });
studentSchema.index(
  { emailKey: 1 },
  { unique: true, partialFilterExpression: { emailKey: { $exists: true }, isDeleted: false } }
);
studentSchema.index({ phoneKey: 1 });
studentSchema.index({ institution: 1, department: 1, level: 1 });

module.exports = mongoose.model('Student', studentSchema, 'students');