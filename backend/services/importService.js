const ExcelJS = require('exceljs');
const { parse } = require('csv-parse/sync');
const { Institution, Department, Level, Student, ImportBatch } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../config/logger');
const { normKey, phoneKey } = require('./normalize');

const MAX_ROWS = 5000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const COLUMNS = ['surname', 'firstname', 'othername', 'department', 'phone', 'email', 'institution', 'level'];
const HEADERS = ['Surname', 'Firstname', 'Othername', 'Department', 'Phone', 'Email', 'Institution', 'Level'];
const LABELS = {
  surname: 'Surname',
  firstname: 'Firstname',
  institution: 'Institution',
  department: 'Department',
  level: 'Level',
};

// Header names are compared with lowercase letters and digits only
const ALIASES = {
  surname: ['surname', 'lastname', 'familyname'],
  firstname: ['firstname', 'firstnames', 'givenname'],
  othername: ['othername', 'othernames', 'middlename'],
  department: ['department', 'dept'],
  phone: ['phone', 'phonenumber', 'phoneno', 'mobile', 'mobilenumber', 'telephone'],
  email: ['email', 'emailaddress'],
  institution: ['institution', 'school', 'institutionname'],
  level: ['level', 'yearlevel'],
};

function cellText(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    return '';
  }
  return String(v).trim();
}

// Returns [{ rowNumber, cells: [string, ...] }] for every non-empty row
async function readRows(file) {
  const name = (file.originalname || '').toLowerCase();
  let rows;

  if (name.endsWith('.csv')) {
    let records;
    try {
      records = parse(file.buffer, {
        bom: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true,
        info: true,
      });
    } catch (e) {
      throw new AppError('The CSV file could not be read. Check that it is a valid CSV file.', 400, 'BAD_FILE');
    }
    rows = records.map((r) => ({ rowNumber: r.info.lines, cells: r.record.map((c) => String(c)) }));
  } else if (name.endsWith('.xlsx')) {
    const buf = file.buffer;
    if (!(buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b)) {
      throw new AppError('That file is not a valid Excel (.xlsx) file.', 400, 'BAD_FILE');
    }
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buf);
    } catch (e) {
      throw new AppError('The Excel file could not be read.', 400, 'BAD_FILE');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new AppError('The Excel file has no sheet.', 400, 'BAD_FILE');
    rows = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      const cells = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push(cellText(row.getCell(c).value));
      rows.push({ rowNumber, cells });
    });
  } else {
    throw new AppError('Upload an Excel (.xlsx) or CSV file.', 400, 'BAD_FILE');
  }

  return rows.filter((r) => r.cells.some((c) => String(c).trim() !== ''));
}

function mapHeaders(headerCells) {
  const index = {};
  headerCells.forEach((cell, i) => {
    const h = String(cell || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    for (const field of COLUMNS) {
      if (index[field] === undefined && ALIASES[field].includes(h)) index[field] = i;
    }
  });
  return index;
}

function assertHeaders(index) {
  const missing = ['surname', 'firstname', 'department', 'institution', 'level']
    .filter((f) => index[f] === undefined)
    .map((f) => LABELS[f]);
  if (index.phone === undefined && index.email === undefined) missing.push('Phone or Email');
  if (missing.length) {
    throw new AppError('The file is missing these columns: ' + missing.join(', ') + '.', 400, 'BAD_FILE');
  }
}

async function runImport(file, adminId) {
  const rows = await readRows(file);
  if (rows.length === 0) throw new AppError('The file is empty.', 400, 'BAD_FILE');

  const [headerRow, ...dataRows] = rows;
  const index = mapHeaders(headerRow.cells);
  assertHeaders(index);
  if (dataRows.length === 0) throw new AppError('The file has no student rows.', 400, 'BAD_FILE');
  if (dataRows.length > MAX_ROWS) {
    throw new AppError(`The file has more than ${MAX_ROWS} rows. Split it and upload in parts.`, 400, 'BAD_FILE');
  }

  // Load the structure and the existing duplicate keys once
  const [institutions, departments, levels, existing] = await Promise.all([
    Institution.find(),
    Department.find(),
    Level.find(),
    Student.find({ isDeleted: false }, 'emailKey phoneKey').lean(),
  ]);
  const instMap = new Map(institutions.map((i) => [i.nameKey, i]));
  const deptMap = new Map(departments.map((d) => [`${d.institution}:${d.nameKey}`, d]));
  const levelMap = new Map(levels.map((l) => [`${l.department}:${l.levelKey}`, l]));

  const emailSeen = new Set();
  const phoneSeen = new Set();
  existing.forEach((s) => {
    if (s.emailKey) emailSeen.add(s.emailKey);
    if (s.phoneKey) phoneSeen.add(s.phoneKey);
  });

  const batch = await ImportBatch.create({ fileName: file.originalname, uploadedBy: adminId });

  const get = (cells, field) =>
    index[field] === undefined ? '' : String(cells[index[field]] === undefined ? '' : cells[index[field]]).trim();

  const toAdd = [];
  const rejected = [];
  let duplicates = 0;

  for (const r of dataRows) {
    const raw = {};
    COLUMNS.forEach((f) => {
      raw[f] = get(r.cells, f);
    });
    if (/^\d{10}$/.test(raw.phone)) raw.phone = '0' + raw.phone; // Excel drops the leading zero

    const reject = (reason) => rejected.push({ rowNumber: r.rowNumber, reason, rowData: raw });

    const emptyField = Object.keys(LABELS).find((f) => !raw[f]);
    if (emptyField) {
      reject(`${LABELS[emptyField]} is empty.`);
      continue;
    }
    if (!raw.email && !raw.phone) {
      reject('Enter an email or a phone number.');
      continue;
    }
    if (raw.email && !EMAIL_RE.test(raw.email)) {
      reject('Email is not valid.');
      continue;
    }

    const inst = instMap.get(normKey(raw.institution));
    if (!inst) {
      reject(`Institution "${raw.institution}" is not in the system.`);
      continue;
    }
    const dept = deptMap.get(`${inst._id}:${normKey(raw.department)}`);
    if (!dept) {
      reject(`Department "${raw.department}" does not exist under ${inst.name}.`);
      continue;
    }
    const level = levelMap.get(`${dept._id}:${normKey(raw.level)}`);
    if (!level) {
      reject(`Level "${raw.level}" does not exist under ${dept.name}.`);
      continue;
    }

    // Duplicates: by email, or by phone when the row has no email
    const ek = raw.email ? normKey(raw.email) : '';
    const pk = phoneKey(raw.phone);
    if (ek) {
      if (emailSeen.has(ek)) {
        duplicates += 1;
        continue;
      }
    } else if (pk && phoneSeen.has(pk)) {
      duplicates += 1;
      continue;
    }

    const doc = new Student({
      surname: raw.surname,
      firstname: raw.firstname,
      othername: raw.othername,
      phone: raw.phone,
      email: raw.email,
      institution: inst._id,
      department: dept._id,
      level: level._id,
      levelKey: level.levelKey,
      source: 'import',
      importBatch: batch._id,
    });
    try {
      await doc.validate();
    } catch (e) {
      reject('This row could not be saved. Check the values.');
      continue;
    }

    toAdd.push(doc);
    if (ek) emailSeen.add(ek);
    if (pk) phoneSeen.add(pk);
  }

  if (toAdd.length) {
    try {
      await Student.insertMany(toAdd, { ordered: false });
    } catch (err) {
      logger.error({ err: err.message }, 'Student import insert failed');
      await ImportBatch.deleteOne({ _id: batch._id });
      throw new AppError(
        'The import could not be completed because of a conflict. Please upload the file again.',
        409,
        'IMPORT_CONFLICT'
      );
    }
  }

  batch.counts = {
    total: dataRows.length,
    added: toAdd.length,
    duplicates,
    rejected: rejected.length,
  };
  batch.rowErrors = rejected;
  await batch.save();
  return batch;
}

function styleSheet(ws, widths) {
  ws.getRow(1).font = { bold: true };
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
}

// Rejected rows with the original columns, so the file can be fixed and uploaded again
function buildErrorWorkbook(batch) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Rejected rows');
  ws.addRow(['Row', 'Reason', ...HEADERS]);
  (batch.rowErrors || []).forEach((e) => {
    ws.addRow([e.rowNumber, e.reason, ...COLUMNS.map((f) => (e.rowData && e.rowData[f]) || '')]);
  });
  styleSheet(ws, [8, 60, 18, 18, 18, 24, 16, 28, 24, 14]);
  return wb;
}

function buildTemplateWorkbook() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.addRow(HEADERS);
  styleSheet(ws, [18, 18, 18, 24, 16, 28, 24, 14]);
  return wb;
}

module.exports = { runImport, buildErrorWorkbook, buildTemplateWorkbook };