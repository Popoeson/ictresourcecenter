const logger = require('../config/logger');

class AppError extends Error {
  constructor(message, status = 400, code = 'BAD_REQUEST') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Not found', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ success: false, message: err.message, code: err.code });
  }
  logger.error({ err: err.message, stack: err.stack, path: req.path }, 'Unhandled error');
  res.status(500).json({
    success: false,
    message: 'Something went wrong. Please try again.',
    code: 'SERVER_ERROR',
  });
}

module.exports = { AppError, notFound, errorHandler };