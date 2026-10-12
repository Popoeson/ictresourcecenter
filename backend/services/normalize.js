// Lowercase, trimmed, single-spaced copy of a value (used for matching and unique indexes)
function normKey(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Digits only
function phoneKey(value) {
  return String(value || '').replace(/\D/g, '');
}

module.exports = { normKey, phoneKey };