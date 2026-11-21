const mongoose = require('mongoose');

const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    handoutDeliveryMode: { type: String, enum: ['pdf', 'pickup', 'hybrid'], default: 'hybrid' },
    tokenWindowMinutes: { type: Number, default: 30 },
    maxFilesPerPurchase: { type: Number, default: 10 },
    maxFileSizeBytes: { type: Number, default: 5242880 },
    allowedExtensions: {
      type: [String],
      default: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp'],
    },
    currency: { type: String, default: 'NGN' },
    // Placeholder for future split payments (not used in v1)
    split: {
      enabled: { type: Boolean, default: false },
      rules: { type: [mongoose.Schema.Types.Mixed], default: [] },
    },
        lecturerContactText: { type: String, default: 'Please contact your course lecturer.' },
    // Infrastructure dues: most instalments a student may use, and the smallest instalment (kobo, 0 = no minimum)
    duesMaxInstalments: { type: Number, default: 1, min: 1 },
    duesMinInstalment: { type: Number, default: 0, min: 0 },
    
  },
  { timestamps: true }
);

module.exports = mongoose.model('Setting', settingSchema, 'settings');