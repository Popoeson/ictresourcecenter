const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const submissionSchema = new mongoose.Schema(
  {
    student: { type: ObjectId, ref: 'Student', required: true },
    token: { type: ObjectId, ref: 'Token', required: true },
    institution: { type: ObjectId, ref: 'Institution', required: true },
    department: { type: ObjectId, ref: 'Department', required: true },
    level: { type: ObjectId, ref: 'Level', required: true },
    file: {
      publicId: { type: String, required: true },
      resourceType: { type: String, required: true },
      deliveryType: { type: String, default: 'authenticated' },
      format: { type: String },
      bytes: { type: Number },
      originalName: { type: String },
      mimeType: { type: String },
      extension: { type: String },
    },
    uploadedAt: { type: Date, default: Date.now },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

submissionSchema.index({ student: 1, uploadedAt: -1 });
submissionSchema.index({ institution: 1, level: 1, uploadedAt: -1 });
submissionSchema.index({ token: 1 });

module.exports = mongoose.model('Submission', submissionSchema, 'submissions');