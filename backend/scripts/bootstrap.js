const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const logger = require('../config/logger');
const { Admin, Setting } = require('../models');

// Creates the single global settings document with defaults, if missing
async function ensureSettings() {
  const exists = await Setting.exists({ key: 'global' });
  if (exists) return;
  try {
    await Setting.create({ key: 'global' });
    logger.info('Default settings created');
  } catch (err) {
    if (err && err.code === 11000) return; // another instance created it first
    throw err;
  }
}

// Creates the first Super Admin from environment variables, only if none exists
async function ensureSuperAdmin() {
  const existing = await Admin.exists({ role: 'superadmin' });
  if (existing) return;

  const email = (env.superAdminEmail || '').toLowerCase().trim();
  const password = env.superAdminPassword || '';

  if (!email || !password) {
    logger.warn('No Super Admin exists and SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD are not set');
    return;
  }
  if (password.length < 10) {
    logger.error('SUPER_ADMIN_PASSWORD must be at least 10 characters. Super Admin not created.');
    return;
  }
  if (await Admin.exists({ email })) {
    logger.error('An admin with SUPER_ADMIN_EMAIL already exists but is not a Super Admin. Nothing created.');
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await Admin.create({
    name: 'Super Admin',
    email,
    passwordHash,
    role: 'superadmin',
    isActive: true,
    mustChangePassword: false,
  });
  logger.info('Super Admin created');
}

async function bootstrap() {
  await ensureSettings();
  await ensureSuperAdmin();
}

module.exports = { bootstrap };