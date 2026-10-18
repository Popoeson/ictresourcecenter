const handoutService = require('../services/handoutService');
const handoutOrderService = require('../services/handoutOrderService');

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

// A fresh short-lived download link for a paid PDF order
async function link(req, res, next) {
  try {
    send(res, await handoutOrderService.signedLinkFor(req.params.reference));
  } catch (err) {
    next(err);
  }
}

module.exports = { list, collect, buildFilter, toRow, POPULATE };