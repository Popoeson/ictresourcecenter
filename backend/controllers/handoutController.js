const handoutService = require('../services/handoutService');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

async function quote(req, res, next) {
  try {
    send(res, await handoutService.quote({
      institution: req.query.institution,
      department: req.query.department,
      level: req.query.level,
    }));
  } catch (err) {
    next(err);
  }
}

async function initialize(req, res, next) {
  try {
    const b = req.body;
    send(res, await handoutService.initializeHandout({
      name: b.name,
      phone: b.phone,
      email: b.email,
      institution: b.institution,
      department: b.department,
      level: b.level,
      delivery: b.delivery,
    }), 201);
  } catch (err) {
    next(err);
  }
}

module.exports = { quote, initialize };