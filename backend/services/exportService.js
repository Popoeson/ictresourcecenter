const ExcelJS = require('exceljs');
const { AppError } = require('../middleware/errorHandler');

const MAX_ROWS = 20000;
const CHUNK = 500;

// 18/10/2026 14:05 in Nigerian time
function lagosDate(d) {
  if (!d) return '';
  return new Date(d)
    .toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    .replace(',', '');
}

function naira(kobo) {
  return typeof kobo === 'number' ? kobo / 100 : '';
}

// students-2026-10-18.xlsx
function fileName(prefix) {
  const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' });
  return prefix + '-' + day + '.xlsx';
}

// Streams an Excel file straight to the response, a few hundred rows at a time.
// columns: [{ header, key, width }]. fetchPage(skip, limit) returns plain row objects keyed by column key.
async function sendWorkbook(res, { filename, sheetName, columns, total, fetchPage }) {
  if (!total) throw new AppError('There is nothing to export for this filter.', 404, 'NO_DATA');
  if (total > MAX_ROWS) {
    throw new AppError('More than ' + MAX_ROWS + ' rows match. Narrow the filter and try again.', 400, 'EXPORT_TOO_LARGE');
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="' + filename + '"');
  res.setHeader('Cache-Control', 'no-store');

  const wb = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width || 18 }));

  const head = {};
  columns.forEach((c) => {
    head[c.key] = c.header;
  });
  const headRow = ws.addRow(head);
  headRow.eachCell((cell) => {
    cell.font = { bold: true };
  });
  headRow.commit();

  let closed = false;
  res.on('close', () => {
    closed = true;
  });

  for (let skip = 0; skip < total; skip += CHUNK) {
    if (closed) return;
    const rows = await fetchPage(skip, CHUNK);
    if (!rows.length) break;
    rows.forEach((r) => ws.addRow(r).commit());
  }

  await ws.commit();
  await wb.commit();
}

module.exports = { sendWorkbook, lagosDate, naira, fileName, MAX_ROWS };