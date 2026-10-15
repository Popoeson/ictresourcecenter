const tokenService = require('../services/tokenService');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

// Checks a token without using it. The upload page then shows the picker and the countdown.
async function unlock(req, res, next) {
  try {
    const token = await tokenService.checkUsable(req.body.token);
    send(res, {
      code: token.code,
      filesAllowed: token.filesAllowed,
      expiresAt: token.expiresAt,
      secondsLeft: Math.max(0, Math.floor((token.expiresAt.getTime() - Date.now()) / 1000)),
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { unlock };