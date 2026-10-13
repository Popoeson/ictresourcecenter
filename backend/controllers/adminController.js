const { Admin } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const { hashPassword } = require('../services/passwordService');
const auditService = require('../services/auditService');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function publicAdmin(a) {
  return {
    id: String(a._id),
    name: a.name,
    email: a.email,
    role: a.role,
    isActive: a.isActive,
    mustChangePassword: a.mustChangePassword,
    lastLoginAt: a.lastLoginAt,
    createdAt: a.createdAt,
  };
}

// Only plain Admin accounts can be managed here
async function findManageable(id) {
  const admin = await Admin.findOne({ _id: id, role: 'admin' });
  if (!admin) throw new AppError('Admin not found.', 404, 'NOT_FOUND');
  return admin;
}

async function listAdmins(req, res, next) {
  try {
    const items = await Admin.find().sort({ role: -1, name: 1 });
    send(res, items.map(publicAdmin));
  } catch (err) {
    next(err);
  }
}

async function createAdmin(req, res, next) {
  try {
    const email = req.body.email.toLowerCase().trim();
    if (await Admin.exists({ email })) {
      throw new AppError('An admin with this email already exists.', 409, 'DUPLICATE');
    }

    const admin = await Admin.create({
      name: req.body.name,
      email,
      passwordHash: await hashPassword(req.body.temporaryPassword),
      role: 'admin',
      isActive: true,
      mustChangePassword: true,
      createdBy: req.admin._id,
    });

    await auditService.log(req, {
      action: 'admin.create', entityType: 'admin', entityId: admin._id, after: publicAdmin(admin),
    });
    send(res, publicAdmin(admin), 201);
  } catch (err) {
    next(err);
  }
}

async function updateAdmin(req, res, next) {
  try {
    const admin = await findManageable(req.params.id);
    const before = publicAdmin(admin);

    const set = {};
    if (req.body.name !== undefined) set.name = req.body.name;
    if (req.body.isActive !== undefined) set.isActive = req.body.isActive;
    await Admin.updateOne({ _id: admin._id }, { $set: set });

    const after = publicAdmin(await Admin.findById(admin._id));
    let action = 'admin.update';
    if (before.isActive && !after.isActive) action = 'admin.deactivate';
    if (!before.isActive && after.isActive) action = 'admin.activate';

    await auditService.log(req, { action, entityType: 'admin', entityId: admin._id, before, after });
    send(res, after);
  } catch (err) {
    next(err);
  }
}

async function resetPassword(req, res, next) {
  try {
    const admin = await findManageable(req.params.id);
    await Admin.updateOne(
      { _id: admin._id },
      {
        $set: {
          passwordHash: await hashPassword(req.body.temporaryPassword),
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockUntil: null,
        },
      }
    );
    await auditService.log(req, {
      action: 'admin.reset_password', entityType: 'admin', entityId: admin._id,
    });
    send(res, { reset: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listAdmins, createAdmin, updateAdmin, resetPassword };