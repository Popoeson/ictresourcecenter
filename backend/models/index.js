// Loading this file registers every model, so Mongoose builds their indexes on startup.
module.exports = {
  Admin: require('./Admin'),
  Institution: require('./Institution'),
  Department: require('./Department'),
  Level: require('./Level'),
    Price: require('./Price'),
  Student: require('./Student'),
  Setting: require('./Setting'),
  Counter: require('./Counter'),
  Payment: require('./Payment'),
    Token: require('./Token'),
  Submission: require('./Submission'),
  HandoutFile: require('./HandoutFile'),
  HandoutOrder: require('./HandoutOrder'),
  ImportBatch: require('./ImportBatch'),
  AuditLog: require('./AuditLog'),
  WebhookEvent: require('./WebhookEvent'),
};