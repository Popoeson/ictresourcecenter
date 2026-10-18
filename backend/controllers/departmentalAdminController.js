const { Student, Payment, Department, Level, Price, Institution } = require('../models');
const studentCtl = require('./studentController');
const exp = require('../services/exportService');
const { normKey } = require('../services/normalize');

const TYPE = 'departmental_fee';
// Same rule as the payment: only departments named "Computer Science", in any institution
const CS_KEY = normKey('Computer Science');
const ID_RX = /^[a-f\d]{24}$/i;

function send(res, data) {
  res.status(200).json({ success: true, data });
}

function cmp(a, b) {
  return String(a || '').localeCompare(String(b || ''), undefined, { numeric: true, sensitivity: 'base' });
}

// Keeps only the filters this page understands
function clean(q) {
  const out = {};
  if (typeof q.institution === 'string' && ID_RX.test(q.institution)) out.institution = q.institution;
  if (typeof q.levelKey === 'string' && q.levelKey.length <= 120) out.levelKey = q.levelKey;
  if (typeof q.q === 'string' && q.q.length <= 120) out.q = q.q;
  if (q.status === 'paid' || q.status === 'unpaid') out.status = q.status;
  return out;
}

async function csDepartments() {
  return Department.find({ nameKey: CS_KEY }).select('_id institution').lean();
}

// base: all matching Computer Science students. list: base narrowed by the Paid or Not paid filter.
async function scope(q) {
  const csIds = (await csDepartments()).map((d) => d._id);
  const base = { ...studentCtl.buildFilter(clean(q)), department: { $in: csIds } };
  const paidIds = await Payment.distinct('student', { type: TYPE, status: 'success' });

  let list = base;
  if (q.status === 'paid') list = { ...base, _id: { $in: paidIds } };
  else if (q.status === 'unpaid') list = { ...base, _id: { $nin: paidIds } };
  return { base, list, paidIds };
}

async function fetchRows(filter, skip, limit) {
  const students = await Student.find(filter)
    .select('surname firstname othername institution department level phone email')
    .populate('institution', 'name')
    .populate('department', 'name')
    .populate('level', 'name')
    .sort({ surname: 1, firstname: 1, _id: 1 })
    .skip(skip)
    .limit(limit)
    .lean();

  const pays = await Payment.find({ type: TYPE, status: 'success', student: { $in: students.map((s) => s._id) } })
    .select('student amount reference receiptNumber confirmedAt providerData.paidAt')
    .lean();
  const byStudent = new Map(pays.map((p) => [String(p.student), p]));

  return students.map((s) => {
    const p = byStudent.get(String(s._id));
    return {
      id: String(s._id),
      name: [s.surname, s.firstname, s.othername].filter(Boolean).join(' '),
      institution: s.institution ? s.institution.name : '',
      department: s.department ? s.department.name : '',
      level: s.level ? s.level.name : '',
      phone: s.phone || '',
      email: s.email || '',
      paid: !!p,
      paidAt: p ? (p.providerData && p.providerData.paidAt) || p.confirmedAt : null,
      amount: p ? p.amount : null,
      reference: p ? p.reference : null,
      receiptNumber: p ? p.receiptNumber || null : null,
    };
  });
}

async function list(req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const { base, list: filter, paidIds } = await scope(req.query);

    const baseIds = await Student.distinct('_id', base);
    const [total, paidCount, money, items] = await Promise.all([
      Student.countDocuments(filter),
      Student.countDocuments({ ...base, _id: { $in: paidIds } }),
      Payment.aggregate([
        { $match: { type: TYPE, status: 'success', student: { $in: baseIds } } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      fetchRows(filter, (page - 1) * limit, limit),
    ]);

    send(res, {
      items,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      summary: {
        students: baseIds.length,
        paid: paidCount,
        unpaid: baseIds.length - paidCount,
        collected: money[0] ? money[0].total : 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

// The fee for each institution and level that has a Computer Science department
async function amounts(req, res, next) {
  try {
    const depts = await csDepartments();
    if (!depts.length) return send(res, []);

    const deptIds = depts.map((d) => d._id);
    const instIds = Array.from(new Set(depts.map((d) => String(d.institution))));

    const [insts, levels, prices] = await Promise.all([
      Institution.find({ _id: { $in: instIds } }).select('name').lean(),
      Level.find({ department: { $in: deptIds } }).select('institution name levelKey').lean(),
      Price.find({ institution: { $in: instIds } }).select('institution levelKey departmentalFee').lean(),
    ]);

    const feeOf = new Map(prices.map((p) => [String(p.institution) + ':' + p.levelKey, p.departmentalFee]));
    const byInst = new Map();
    levels.forEach((l) => {
      const k = String(l.institution);
      if (!byInst.has(k)) byInst.set(k, new Map());
      if (!byInst.get(k).has(l.levelKey)) {
        const fee = feeOf.get(k + ':' + l.levelKey);
        byInst.get(k).set(l.levelKey, {
          levelKey: l.levelKey,
          levelLabel: l.name,
          departmentalFee: Number.isInteger(fee) ? fee : null,
        });
      }
    });

    insts.sort((a, b) => cmp(a.name, b.name));
    send(
      res,
      insts.map((i) => ({
        institution: { id: String(i._id), name: i.name },
        levels: Array.from((byInst.get(String(i._id)) || new Map()).values()).sort((a, b) =>
          cmp(a.levelLabel, b.levelLabel)
        ),
      }))
    );
  } catch (err) {
    next(err);
  }
}

async function exportFile(req, res, next) {
  try {
    const { list: filter } = await scope(req.query);
    const total = await Student.countDocuments(filter);

    await exp.sendWorkbook(res, {
      filename: exp.fileName('departmental-fee'),
      sheetName: 'Departmental fee',
      total,
      columns: [
        { header: 'Student', key: 'name', width: 30 },
        { header: 'Institution', key: 'institution', width: 26 },
        { header: 'Department', key: 'department', width: 26 },
        { header: 'Level', key: 'level', width: 14 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Departmental fee', key: 'status', width: 16 },
        { header: 'Paid on', key: 'paidAt', width: 18 },
        { header: 'Amount (NGN)', key: 'amount', width: 16 },
        { header: 'Reference', key: 'reference', width: 20 },
        { header: 'Receipt number', key: 'receipt', width: 16 },
      ],
      fetchPage: async (skip, limit) => {
        const rows = await fetchRows(filter, skip, limit);
        return rows.map((r) => ({
          name: r.name,
          institution: r.institution,
          department: r.department,
          level: r.level,
          phone: r.phone,
          email: r.email,
          status: r.paid ? 'Paid' : 'Not paid',
          paidAt: exp.lagosDate(r.paidAt),
          amount: exp.naira(r.amount),
          reference: r.reference || '',
          receipt: r.receiptNumber || '',
        }));
      },
    });
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    next(err);
  }
}

module.exports = { list, amounts, exportFile };