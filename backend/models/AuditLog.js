const mongoose = require('mongoose');

const { ObjectId } = mongoose.Schema.Types;

const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: ObjectId, ref: 'Admin', default: null },
    actorRole: { type: String },
    action: { type: String, required: true },
    entityType: { type: String },
    entityId: { type: ObjectId, default: null },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
    ip: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ entityType: 1, entityId: 1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema, 'auditLogs');