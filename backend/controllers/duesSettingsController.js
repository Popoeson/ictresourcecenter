const { Setting } = require('../models');
const duesService = require('../services/duesService');
const auditService = require('../services/auditService');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// Both roles can read
async function getSettings(req, res, next) {
  try {
    send(res, await duesService.getSettings());
  } catch (err) {
    next(err);
  }
}

// Super Admin: change the maximum number of instalments and the minimum instalment amount (kobo, 0 means no minimum)
async function updateSettings(req, res, next) {
  try {
    const before = await duesService.getSettings();
    const set = {};
    if (req.body.maxInstalments !== undefined) set.duesMaxInstalments = req.body.maxInstalments;
    if (req.body.minInstalment !== undefined) set.duesMinInstalment = req.body.minInstalment;

    await Setting.updateOne({ key: 'global' }, { $set: set }, { upsert: true, setDefaultsOnInsert: true });
    const after = await duesService.getSettings();

    await auditService.log(req, {
      action: 'dues.settings_update',
      entityType: 'settings',
      before,
      after,
    });
    send(res, after);
  } catch (err) {
    next(err);
  }
}

module.exports = { getSettings, updateSettings };