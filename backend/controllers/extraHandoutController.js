const extraHandoutService = require('../services/extraHandoutService');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

async function list(req, res, next) {
  try {
    send(res, await extraHandoutService.listAvailable({
      institution: req.query.institution,
      department: req.query.department,
      level: req.query.level,
    }));
  } catch (err) {
    next(err);
  }
}

async function quote(req, res, next) {
  try {
    send(res, await extraHandoutService.quote(req.query.handout));
  } catch (err) {
    next(err);
  }
}

async function initialize(req, res, next) {
  try {
    const b = req.body;
    send(res, await extraHandoutService.initializeExtraHandout({
      name: b.name,
      phone: b.phone,
      email: b.email,
      handout: b.handout,
      delivery: b.delivery,
    }), 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { list, quote, initialize };