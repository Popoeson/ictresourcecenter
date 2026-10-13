const mongoose = require('mongoose');

const importBatchSchema = new mongoose.Schema(
  {
    fileName: { type: String },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    counts: {
      total: { type: Number, default: 0 },
      added: { type: Number, default: 0 },
      duplicates: { type: Number, default: 0 },
      rejected: { type: Number, default: 0 },
    },
        rowErrors: [
      {
        _id: false,
        rowNumber: { type: Number },
        reason: { type: String },
        rowData: { type: mongoose.Schema.Types.Mixed },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('ImportBatch', importBatchSchema, 'importBatches');