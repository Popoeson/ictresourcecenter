const mongoose = require('mongoose');
const { Student, Submission, Payment, HandoutOrder, Institution, Department, Level } = require('../models');

const ID_RX = /^[a-f\d]{24}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

const VIEWS = {
  students: ['class'],
  submissions: ['class', 'student', 'missing'],
  payments: ['type', 'institution'],
  handouts: ['class'],
};

const TYPE_LABEL = { ict_fee: 'ICT fee', assignment: 'Assignment', handout: 'Handout' };
const TYPE_ORDER = ['ict_fee', 'assignment', 'handout'];

function oid(v) {
  return new mongoose.Types.ObjectId(v);
}

function cmp(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

// Keeps only filters the reports understand, with valid values
function cleanQuery(tab, q) {
  const out = {};
  ['institution', 'department', 'level'].forEach((k) => {
    if (typeof q[k] === 'string' && ID_RX.test(q[k])) out[k] = q[k];
  });
  ['from', 'to'].forEach((k) => {
    if (typeof q[k] === 'string' && DATE_RX.test(q[k])) out[k] = q[k];
  });
  const views = VIEWS[tab];
  out.view = views.includes(q.view) ? q.view : views[0];
  return out;
}

function scope(q) {
  const f = {};
  ['institution', 'department', 'level'].forEach((k) => {
    if (q[k]) f[k] = oid(q[k]);
  });
  return f;
}

// Dates are treated as Nigerian local days (UTC+1)
function range(q) {
  if (!q.from && !q.to) return null;
  const r = {};
  if (q.from) r.$gte = new Date(q.from + 'T00:00:00+01:00');
  if (q.to) r.$lte = new Date(q.to + 'T23:59:59.999+01:00');
  return r;
}

function personName(s) {
  return s ? [s.surname, s.firstname, s.othername].filter(Boolean).join(' ') : '';
}

async function nameMaps(list) {
  const ids = { institution: new Set(), department: new Set(), level: new Set() };
  list.forEach((r) => {
    Object.keys(ids).forEach((k) => {
      if (r[k]) ids[k].add(String(r[k]));
    });
  });
  const toMap = (docs) => new Map(docs.map((d) => [String(d._id), d.name]));
  const [i, d, l] = await Promise.all([
    Institution.find({ _id: { $in: Array.from(ids.institution) } }).select('name').lean(),
    Department.find({ _id: { $in: Array.from(ids.department) } }).select('name').lean(),
    Level.find({ _id: { $in: Array.from(ids.level) } }).select('name').lean(),
  ]);
  return { institution: toMap(i), department: toMap(d), level: toMap(l) };
}

// Replaces institution, department and level ids with their names
async function nameClassRows(list) {
  const maps = await nameMaps(list);
  return list.map((r) => ({
    ...r,
    institution: maps.institution.get(String(r.institution)) || '',
    department: maps.department.get(String(r.department)) || '',
    level: maps.level.get(String(r.level)) || '',
  }));
}

function sortClass(rows) {
  rows.sort((a, b) => cmp(a.institution, b.institution) || cmp(a.department, b.department) || cmp(a.level, b.level));
}

const CLASS_COLS = [
  { key: 'institution', header: 'Institution', width: 26, kind: 'text' },
  { key: 'department', header: 'Department', width: 26, kind: 'text' },
  { key: 'level', header: 'Level', width: 14, kind: 'text' },
];

// Adds up a number column by label, for the bar chart
function chartBy(rows, labelKey, valueKey, title, kind) {
  const sums = new Map();
  rows.forEach((r) => {
    const label = r[labelKey] || 'Unknown';
    sums.set(label, (sums.get(label) || 0) + (Number(r[valueKey]) || 0));
  });
  const items = Array.from(sums, ([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);
  return { title, kind, items };
}

// A row of sums for the number and money columns. The first column says "Total".
function totals(columns, rows) {
  const sumCols = columns.filter((c) => c.kind === 'number' || c.kind === 'money');
  if (!sumCols.length) return null;
  const t = {};
  sumCols.forEach((c) => {
    t[c.key] = rows.reduce((sum, r) => sum + (Number(r[c.key]) || 0), 0);
  });
  t[columns[0].key] = 'Total';
  return t;
}

/* ---------- Students ---------- */

async function students(q) {
  const groups = await Student.aggregate([
    { $match: { isDeleted: false, ...scope(q) } },
    {
      $group: {
        _id: { institution: '$institution', department: '$department', level: '$level' },
        students: { $sum: 1 },
        paid: { $sum: { $cond: ['$ictFeePaid', 1, 0] } },
      },
    },
  ]);
  const rows = await nameClassRows(
    groups.map((g) => ({ ...g._id, students: g.students, paid: g.paid, unpaid: g.students - g.paid }))
  );
  sortClass(rows);
  return {
    columns: [
      ...CLASS_COLS,
      { key: 'students', header: 'Students', width: 12, kind: 'number' },
      { key: 'paid', header: 'ICT fee paid', width: 14, kind: 'number' },
      { key: 'unpaid', header: 'ICT fee not paid', width: 16, kind: 'number' },
    ],
    rows,
    chart: chartBy(rows, 'institution', 'students', 'Students per institution', 'number'),
  };
}

/* ---------- Submissions ---------- */

async function submissions(q) {
  const match = { isDeleted: false, ...scope(q) };
  const r = range(q);
  if (r) match.uploadedAt = r;

  if (q.view === 'student') {
    const groups = await Submission.aggregate([
      { $match: match },
      { $group: { _id: '$student', files: { $sum: 1 }, tokens: { $addToSet: '$token' }, last: { $max: '$uploadedAt' } } },
      { $project: { files: 1, last: 1, uploads: { $size: '$tokens' } } },
    ]);
    const studs = await Student.find({ _id: { $in: groups.map((g) => g._id) } })
      .select('surname firstname othername institution department level')
      .lean();
    const byId = new Map(studs.map((s) => [String(s._id), s]));
    const rows = await nameClassRows(
      groups.map((g) => {
        const s = byId.get(String(g._id));
        return {
          student: s ? personName(s) : 'Removed student',
          institution: s && s.institution,
          department: s && s.department,
          level: s && s.level,
          files: g.files,
          uploads: g.uploads,
          last: g.last,
        };
      })
    );
    rows.sort((a, b) => cmp(a.student, b.student));
    return {
      columns: [
        { key: 'student', header: 'Student', width: 28, kind: 'text' },
        ...CLASS_COLS,
        { key: 'files', header: 'Files', width: 10, kind: 'number' },
        { key: 'uploads', header: 'Uploads', width: 10, kind: 'number' },
        { key: 'last', header: 'Last submitted', width: 18, kind: 'date' },
      ],
      rows,
      chart: chartBy(rows, 'institution', 'files', 'Files per institution', 'number'),
    };
  }

  if (q.view === 'missing') {
    const submitted = await Submission.distinct('student', match);
    const studs = await Student.find({ isDeleted: false, ...scope(q), _id: { $nin: submitted } })
      .select('surname firstname othername phone email institution department level')
      .lean();
    const rows = await nameClassRows(
      studs.map((s) => ({
        student: personName(s),
        institution: s.institution,
        department: s.department,
        level: s.level,
        phone: s.phone || '',
        email: s.email || '',
      }))
    );
    rows.sort((a, b) => cmp(a.student, b.student));
    return {
      columns: [
        { key: 'student', header: 'Student', width: 28, kind: 'text' },
        ...CLASS_COLS,
        { key: 'phone', header: 'Phone', width: 16, kind: 'text' },
        { key: 'email', header: 'Email', width: 30, kind: 'text' },
      ],
      rows,
      chart: null,
    };
  }

  // By class: how many students have submitted and how many have not
  const [subGroups, stuGroups] = await Promise.all([
    Submission.aggregate([
      { $match: match },
      {
        $group: {
          _id: { institution: '$institution', department: '$department', level: '$level' },
          files: { $sum: 1 },
          students: { $addToSet: '$student' },
        },
      },
      { $project: { files: 1, submitted: { $size: '$students' } } },
    ]),
    Student.aggregate([
      { $match: { isDeleted: false, ...scope(q) } },
      {
        $group: {
          _id: { institution: '$institution', department: '$department', level: '$level' },
          students: { $sum: 1 },
        },
      },
    ]),
  ]);

  const keyOf = (id) => [id.institution, id.department, id.level].map(String).join('|');
  const merged = new Map();
  stuGroups.forEach((g) => merged.set(keyOf(g._id), { ...g._id, students: g.students, submitted: 0, files: 0 }));
  subGroups.forEach((g) => {
    const k = keyOf(g._id);
    const row = merged.get(k) || { ...g._id, students: 0, submitted: 0, files: 0 };
    row.submitted = g.submitted;
    row.files = g.files;
    merged.set(k, row);
  });

  const rows = await nameClassRows(
    Array.from(merged.values()).map((r) => ({ ...r, notYet: Math.max(0, r.students - r.submitted) }))
  );
  sortClass(rows);
  return {
    columns: [
      ...CLASS_COLS,
      { key: 'students', header: 'Students', width: 12, kind: 'number' },
      { key: 'submitted', header: 'Submitted', width: 12, kind: 'number' },
      { key: 'notYet', header: 'Not yet submitted', width: 18, kind: 'number' },
      { key: 'files', header: 'Files', width: 10, kind: 'number' },
    ],
    rows,
    chart: chartBy(rows, 'institution', 'files', 'Files per institution', 'number'),
  };
}

/* ---------- Payments ---------- */

async function payments(q) {
  const match = { ...scope(q) };
  const r = range(q);
  if (r) match.createdAt = r;

  const byType = q.view === 'type';
  const groups = await Payment.aggregate([
    { $match: match },
    {
      $group: {
        _id: { key: byType ? '$type' : '$institution', status: '$status' },
        count: { $sum: 1 },
        total: { $sum: '$amount' },
      },
    },
  ]);

  const map = new Map();
  if (byType) TYPE_ORDER.forEach((t) => map.set(t, { key: t, paid: 0, collected: 0, pending: 0, flagged: 0, failed: 0 }));
  groups.forEach((g) => {
    const k = String(g._id.key);
    if (!map.has(k)) map.set(k, { key: k, paid: 0, collected: 0, pending: 0, flagged: 0, failed: 0 });
    const row = map.get(k);
    if (g._id.status === 'success') {
      row.paid += g.count;
      row.collected += g.total;
    } else if (g._id.status === 'pending') row.pending += g.count;
    else if (g._id.status === 'flagged') row.flagged += g.count;
    else row.failed += g.count;
  });

  let rows = Array.from(map.values());
  if (byType) {
    rows.forEach((x) => {
      x.group = TYPE_LABEL[x.key] || x.key;
    });
  } else {
    const insts = await Institution.find({ _id: { $in: rows.filter((x) => x.key !== 'undefined' && x.key !== 'null').map((x) => x.key) } })
      .select('name')
      .lean();
    const names = new Map(insts.map((i) => [String(i._id), i.name]));
    rows.forEach((x) => {
      x.group = names.get(x.key) || 'Unknown';
    });
    rows.sort((a, b) => cmp(a.group, b.group));
  }
  rows = rows.map((x) => ({
    group: x.group,
    paid: x.paid,
    collected: x.collected,
    pending: x.pending,
    flagged: x.flagged,
    failed: x.failed,
  }));

  return {
    columns: [
      { key: 'group', header: byType ? 'Payment for' : 'Institution', width: 26, kind: 'text' },
      { key: 'paid', header: 'Paid payments', width: 14, kind: 'number' },
      { key: 'collected', header: 'Collected', width: 16, kind: 'money' },
      { key: 'pending', header: 'Pending', width: 12, kind: 'number' },
      { key: 'flagged', header: 'Flagged', width: 12, kind: 'number' },
      { key: 'failed', header: 'Failed or abandoned', width: 20, kind: 'number' },
    ],
    rows,
    chart: chartBy(rows, 'group', 'collected', byType ? 'Collected by payment type' : 'Collected per institution', 'money'),
  };
}

/* ---------- Handouts ---------- */

async function handouts(q) {
  const match = { ...scope(q) };
  const r = range(q);
  if (r) match.createdAt = r;

  const count = (cond) => ({ $sum: { $cond: [cond, 1, 0] } });
  const groups = await HandoutOrder.aggregate([
    { $match: match },
    {
      $group: {
        _id: { institution: '$institution', department: '$department', level: '$level' },
        orders: { $sum: 1 },
        pdf: count({ $eq: ['$delivery', 'pdf'] }),
        pickup: count({ $eq: ['$delivery', 'pickup'] }),
        studentBuyers: count({ $eq: ['$isStudent', true] }),
        waiting: count({ $eq: ['$pickup.status', 'pending'] }),
        collected: count({ $eq: ['$pickup.status', 'collected'] }),
      },
    },
  ]);

  const rows = await nameClassRows(
    groups.map((g) => ({
      ...g._id,
      orders: g.orders,
      pdf: g.pdf,
      pickup: g.pickup,
      studentBuyers: g.studentBuyers,
      nonStudents: g.orders - g.studentBuyers,
      waiting: g.waiting,
      collected: g.collected,
    }))
  );
  sortClass(rows);
  return {
    columns: [
      ...CLASS_COLS,
      { key: 'orders', header: 'Orders', width: 10, kind: 'number' },
      { key: 'pdf', header: 'PDF', width: 8, kind: 'number' },
      { key: 'pickup', header: 'Pickup', width: 10, kind: 'number' },
      { key: 'studentBuyers', header: 'Student buyers', width: 16, kind: 'number' },
      { key: 'nonStudents', header: 'Non-student buyers', width: 20, kind: 'number' },
      { key: 'waiting', header: 'Pickup waiting', width: 16, kind: 'number' },
      { key: 'collected', header: 'Pickup collected', width: 18, kind: 'number' },
    ],
    rows,
    chart: chartBy(rows, 'institution', 'orders', 'Orders per institution', 'number'),
  };
}

const BUILDERS = { students, submissions, payments, handouts };

// Returns { columns, rows, chart } for one tab. rows are plain objects keyed by column key.
async function build(tab, q) {
  return BUILDERS[tab](q);
}

module.exports = { build, cleanQuery, totals, VIEWS };