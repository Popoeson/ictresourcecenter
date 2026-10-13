const jwt = require('jsonwebtoken');
const { env } = require('../config/env');
const { Admin } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { hashPassword, verifyPassword, burnTime } = require('../services/passwordService');

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const SESSION_MS = 8 * 60 * 60 * 1000;
const INVALID = 'Invalid email or password.';

function cookieOptions() {
  return {
    httpOnly: true,
    secure: env.nodeEnv === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

function publicAdmin(admin) {
  return {
    id: String(admin._id),
    name: admin.name,
    email: admin.email,
    role: admin.role,
    mustChangePassword: admin.mustChangePassword,
  };
}

async function login(req, res, next) {
  try {
    const email = req.body.email.toLowerCase().trim();
    const { password } = req.body;

    const admin = await Admin.findOne({ email }).select('+passwordHash');

    if (!admin || !admin.isActive) {
      await burnTime(password);
      throw new AppError(INVALID, 401, 'INVALID_CREDENTIALS');
    }

    if (admin.lockUntil && admin.lockUntil > new Date()) {
      throw new AppError('Too many failed attempts. Please try again later.', 429, 'ACCOUNT_LOCKED');
    }

    const ok = await verifyPassword(password, admin.passwordHash);
    if (!ok) {
      const updated = await Admin.findByIdAndUpdate(
        admin._id,
        { $inc: { failedLoginAttempts: 1 } },
        { new: true }
      );
      if (updated && updated.failedLoginAttempts >= MAX_ATTEMPTS) {
        await Admin.updateOne(
          { _id: admin._id },
          { $set: { lockUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000), failedLoginAttempts: 0 } }
        );
      }
      throw new AppError(INVALID, 401, 'INVALID_CREDENTIALS');
    }

    await Admin.updateOne(
      { _id: admin._id },
      { $set: { failedLoginAttempts: 0, lockUntil: null, lastLoginAt: new Date() } }
    );

    const token = jwt.sign({ sub: String(admin._id) }, env.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: env.jwtExpiresIn,
    });
    res.cookie(env.cookieName, token, { ...cookieOptions(), maxAge: SESSION_MS });
    res.json({ success: true, data: publicAdmin(admin) });
  } catch (err) {
    next(err);
  }
}

function logout(req, res) {
  res.clearCookie(env.cookieName, cookieOptions());
  res.json({ success: true, data: { loggedOut: true } });
}

function me(req, res) {
  res.json({ success: true, data: publicAdmin(req.admin) });
}

async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin._id).select('+passwordHash');

    const ok = await verifyPassword(currentPassword, admin.passwordHash);
    if (!ok) throw new AppError('Your current password is not correct.', 400, 'WRONG_PASSWORD');
    if (currentPassword === newPassword) {
      throw new AppError('Choose a new password that is different from the current one.', 400, 'SAME_PASSWORD');
    }

    admin.passwordHash = await hashPassword(newPassword);
    admin.mustChangePassword = false;
    admin.failedLoginAttempts = 0;
    await admin.save();

    res.json({ success: true, data: publicAdmin(admin) });
  } catch (err) {
    next(err);
  }
}

module.exports = { login, logout, me, changePassword };