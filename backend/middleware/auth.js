const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { Admin } = require('../models');
const { AppError } = require('./errorHandler');

const SESSION_ENDED = 'Your session has ended. Please log in again.';

// Reads the session cookie and loads the admin from the database on every request,
// so a deactivated admin is blocked immediately.
async function authenticate(req, res, next) {
  try {
    const token = req.cookies && req.cookies[env.cookieName];
    if (!token) throw new AppError(SESSION_ENDED, 401, 'UNAUTHENTICATED');

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
    } catch (e) {
      throw new AppError(SESSION_ENDED, 401, 'UNAUTHENTICATED');
    }

    const admin = await Admin.findById(payload.sub);
    if (!admin || !admin.isActive) throw new AppError(SESSION_ENDED, 401, 'UNAUTHENTICATED');

    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

// Blocks everything except password change and logout until the temporary password is replaced
function enforcePasswordChange(req, res, next) {
  if (req.admin && req.admin.mustChangePassword) {
    return next(new AppError('Please set a new password to continue.', 403, 'PASSWORD_CHANGE_REQUIRED'));
  }
  next();
}

// Use this on every normal protected route
const protect = [authenticate, enforcePasswordChange];

// Usage: requireRole('superadmin')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      return next(new AppError('You have view-only access.', 403, 'FORBIDDEN'));
    }
    next();
  };
}

module.exports = { authenticate, enforcePasswordChange, protect, requireRole };