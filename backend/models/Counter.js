const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Atomically add 1 and return the new number (used for receipt numbers)
counterSchema.statics.next = async function (name) {
  const doc = await this.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema, 'counters');