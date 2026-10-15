const crypto = require('crypto');
const { Token, Setting } = require('../models');
const { AppError } = require('../middleware/errorHandler');

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const DEFAULT_WINDOW_MINUTES = 30;
const MAX_CODE_TRIES = 5;

async function getWindowMinutes() {
  const s = await Setting.findOne({ key: 'global' }).select('tokenWindowMinutes').lean();
  return (s && s.tokenWindowMinutes) || DEFAULT_WINDOW_MINUTES;
}

// ICT- followed by 6 random uppercase letters or digits, for example ICT-7K2QZ9
function generateCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CHARS[crypto.randomInt(CHARS.length)];
  return 'ICT-' + s;
}

// Accepts "ict-7k2qz9", "ICT 7K2QZ9", "7K2QZ9" and so on. Returns "ICT-7K2QZ9" or null.
function normaliseCode(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let body = null;
  if (raw.length === 6) body = raw;
  else if (raw.length === 9 && raw.startsWith('ICT')) body = raw.slice(3);
  return body ? 'ICT-' + body : null;
}

// startsAt is the payment confirmation time for paid tokens, or "now" for manual and reissued ones.
// A payment can only ever produce one token, so repeating this for the same payment returns the first one.
async function createToken({ student, payment = null, source, filesAllowed, createdBy = null, reissuedFrom = null, startsAt }) {
  if (payment) {
    const existing = await Token.findOne({ payment });
    if (existing) return existing;
  }

  const minutes = await getWindowMinutes();
  const expiresAt = new Date((startsAt || new Date()).getTime() + minutes * 60 * 1000);

  for (let i = 0; i < MAX_CODE_TRIES; i++) {
    try {
      return await Token.create({
        code: generateCode(),
        student,
        payment,
        source,
        filesAllowed,
        createdBy,
        reissuedFrom,
        expiresAt,
      });
    } catch (err) {
      const clash = err && err.code === 11000 && err.keyPattern && err.keyPattern.code;
      if (!clash) throw err;
    }
  }
  throw new AppError('Could not create a token. Please try again.', 500, 'TOKEN_ERROR');
}

// Finds a token and checks it can be used. Throws a student-friendly error otherwise.
async function checkUsable(input) {
  const code = normaliseCode(input);
  const invalid = new AppError('That token is not valid. Check it and try again.', 404, 'TOKEN_INVALID');
  if (!code) throw invalid;

  const token = await Token.findOne({ code });
  if (!token) throw invalid;

  if (token.status === 'used') {
    throw new AppError('This token has already been used. Pay again to get a new token.', 409, 'TOKEN_USED');
  }
  if (token.status === 'revoked') throw invalid;
  if (token.status === 'in_progress') {
    throw new AppError('This token is being used right now. Please wait a moment.', 409, 'TOKEN_BUSY');
  }
  if (token.status === 'expired' || token.expiresAt <= new Date()) {
    if (token.status === 'active') {
      await Token.updateOne({ _id: token._id, status: 'active' }, { $set: { status: 'expired' } });
    }
    const minutes = await getWindowMinutes();
    throw new AppError(
      'The time for this token is over. Pay again for a new token and a new ' + minutes + ' minutes.',
      410,
      'TOKEN_EXPIRED'
    );
  }
  return token;
}

// Only one request can win this. It also fails if the window has already ended.
async function claim(code) {
  return Token.findOneAndUpdate(
    { code, status: 'active', expiresAt: { $gt: new Date() } },
    { $set: { status: 'in_progress', claimedAt: new Date() } },
    { new: true }
  );
}

// The whole upload failed: give the token back while the window is still open.
async function release(tokenId) {
  const now = new Date();
  await Token.updateOne(
    { _id: tokenId, status: 'in_progress', expiresAt: { $gt: now } },
    { $set: { status: 'active', claimedAt: null } }
  );
  await Token.updateOne({ _id: tokenId, status: 'in_progress', expiresAt: { $lte: now } }, { $set: { status: 'expired' } });
}

// Files were stored. Unused slots are forfeited.
async function finish(tokenId, filesUploaded) {
  await Token.updateOne(
    { _id: tokenId, status: 'in_progress' },
    { $set: { status: 'used', filesUploaded, usedAt: new Date() } }
  );
}

module.exports = { createToken, checkUsable, claim, release, finish, normaliseCode, generateCode, getWindowMinutes };