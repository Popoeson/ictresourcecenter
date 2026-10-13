const bcrypt = require('bcryptjs');

const ROUNDS = 12;

function hashPassword(plain) {
  return bcrypt.hash(plain, ROUNDS);
}

function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// Spends about the same time as a real check, so response time doesn't reveal whether an email exists
let dummyHash = null;
async function burnTime(plain) {
  if (!dummyHash) dummyHash = await bcrypt.hash('timing-pad-value', ROUNDS);
  await bcrypt.compare(plain, dummyHash);
}

module.exports = { hashPassword, verifyPassword, burnTime };