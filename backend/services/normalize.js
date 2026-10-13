// Lowercase, trimmed, single-spaced copy of a value (used for matching and unique indexes)
function normKey(value) {
  return String(value || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Digits only, with Nigerian formats made equal:
// 08012345678, 8012345678, 2348012345678 and +234 801 234 5678 all become 08012345678
function phoneKey(value) {
  let d = String(value || '').replace(/\D/g, '');
  if (d.startsWith('00234')) d = d.slice(2);
  if (d.startsWith('234') && d.length === 13) d = '0' + d.slice(3);
  else if (d.length === 10 && !d.startsWith('0')) d = '0' + d;
  return d;
}

module.exports = { normKey, phoneKey };