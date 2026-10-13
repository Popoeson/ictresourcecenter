const { AuditLog } = require('../models');
const logger = require('../config/logger');

// Shallow plain copy that never includes a password hash
function plain(value) {
  if (!value) return value;
  const obj = typeof value.toObject === 'function' ? value.toObject() : { ...value };
  delete obj.passwordHash;
  return obj;
}

// Usage: await auditService.log(req, { action, entityType, entityId, before, after })
// Pass req = null for system actions. Never throws: a logging failure must not break the action.
async function log(req, { action, entityType, entityId, before, after }) {
  try {
    await AuditLog.create({
      actor: req && req.admin ? req.admin._id : null,
      actorRole: req && req.admin ? req.admin.role : null,
      action,
      entityType,
      entityId: entityId || null,
      before: plain(before),
      after: plain(after),
      ip: req ? req.ip : null,
    });
  } catch (err) {
    logger.error({ err: err.message, action }, 'Audit log write failed');
  }
}

module.exports = { log };