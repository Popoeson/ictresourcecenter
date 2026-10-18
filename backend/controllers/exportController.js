const { Student, Payment, HandoutOrder, Submission } = require('../models');
const exp = require('../services/exportService');
const studentCtl = require('./studentController');
const paymentCtl = require('./paymentAdminController');
const orderCtl = require('./handoutOrderAdminController');
const submissionCtl = require('./submissionAdminController');

const ID_RX = /^[a-f\d]{24}$/i;
const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

// Keeps only filters the lists understand, with valid values
function clean(q) {
  const out = {};
  ['institution', 'department', 'level'].forEach((k) => {
    if (typeof q[k] === 'string' && ID_RX.test(q[k])) out[k] = q[k];
  });
  ['from', 'to'].forEach((k) => {
    if (typeof q[k] === 'string' && DATE_RX.test(q[k])) out[k] = q[k];
  });
  ['q', 'type', 'status', 'ictFeePaid', 'delivery', 'buyer', 'pickup', 'levelKey'].forEach((k) => {
    if (typeof q[k] === 'string' && q[k].length <= 100) out[k] = q[k];
  });
  return out;
}

// If the file has already started, all we can do is stop the download
function fail(res, next, err) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  next(err);
}

const TYPE_LABEL = { ict_fee: 'ICT fee', departmental_fee: 'Departmental fee', assignment: 'Assignment', handout: 'Handout' };

/* ---------- Students ---------- */

async function students(req, res, next) {
  try {
    const filter = studentCtl.buildFilter(clean(req.query));
    const total = await Student.countDocuments(filter);

    await exp.sendWorkbook(res, {
      filename: exp.fileName('students'),
      sheetName: 'Students',
      total,
      columns: [
        { header: 'Surname', key: 'surname', width: 20 },
        { header: 'First name', key: 'firstname', width: 20 },
        { header: 'Other name', key: 'othername', width: 20 },
        { header: 'Institution', key: 'institution', width: 26 },
        { header: 'Department', key: 'department', width: 26 },
        { header: 'Level', key: 'level', width: 14 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'ICT fee', key: 'fee', width: 12 },
        { header: 'ICT fee paid on', key: 'feePaidOn', width: 18 },
      ],
      fetchPage: async (skip, limit) => {
        const docs = await Student.find(filter)
          .select('-searchTokens -emailKey -phoneKey')
          .populate('institution', 'name')
          .populate('department', 'name')
          .populate('level', 'name')
          .sort({ surname: 1, firstname: 1, _id: 1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return docs.map((s) => ({
          surname: s.surname || '',
          firstname: s.firstname || '',
          othername: s.othername || '',
          institution: s.institution ? s.institution.name : '',
          department: s.department ? s.department.name : '',
          level: s.level ? s.level.name : '',
          phone: s.phone || '',
          email: s.email || '',
          fee: s.ictFeePaid ? 'Paid' : 'Not paid',
          feePaidOn: exp.lagosDate(s.ictFeePaidAt),
        }));
      },
    });
  } catch (err) {
    fail(res, next, err);
  }
}

/* ---------- Payments ---------- */

const PAYMENT_FIELDS =
  'reference type status amount currency payer institution department level details confirmedAt confirmedVia receiptNumber flagReason createdAt providerData.paidAt providerData.channel';

function paymentFor(p) {
  let text = TYPE_LABEL[p.type] || p.type;
  if (p.type === 'assignment' && p.fileCount) text += ' - ' + p.fileCount + (p.fileCount === 1 ? ' file' : ' files');
  if (p.type === 'handout' && p.delivery) text += ' - ' + (p.delivery === 'pdf' ? 'PDF' : 'Pickup');
  return text;
}

const STATUS_LABEL = { success: 'Paid', pending: 'Pending', flagged: 'Flagged', failed: 'Failed', abandoned: 'Abandoned' };

async function payments(req, res, next) {
  try {
    const isSuper = req.admin.role === 'superadmin';
    const filter = paymentCtl.buildFilter(clean(req.query), true);
    const total = await Payment.countDocuments(filter);

    const columns = [
      { header: 'Date', key: 'date', width: 18 },
      { header: 'Paid by', key: 'payer', width: 28 },
      { header: 'Payment for', key: 'forText', width: 24 },
      { header: 'Institution', key: 'institution', width: 26 },
      { header: 'Department', key: 'department', width: 26 },
      { header: 'Level', key: 'level', width: 14 },
      { header: 'Amount (NGN)', key: 'amount', width: 16 },
      { header: 'Status', key: 'status', width: 12 },
      { header: 'Reference', key: 'reference', width: 20 },
      { header: 'Receipt number', key: 'receipt', width: 16 },
      { header: 'Channel', key: 'channel', width: 12 },
      { header: 'Paid on', key: 'paidAt', width: 18 },
    ];
    // The flag reason and how it was confirmed are for the Super Admin only
    if (isSuper) {
      columns.push({ header: 'Flag reason', key: 'flagReason', width: 40 });
      columns.push({ header: 'Confirmed via', key: 'confirmedVia', width: 14 });
    }

    await exp.sendWorkbook(res, {
      filename: exp.fileName('payments'),
      sheetName: 'Payments',
      total,
      columns,
      fetchPage: async (skip, limit) => {
        const docs = await Payment.find(filter)
          .select(PAYMENT_FIELDS)
          .populate('institution', 'name')
          .populate('department', 'name')
          .populate('level', 'name')
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return docs.map((d) => {
          const p = paymentCtl.toRow(d, isSuper);
          const row = {
            date: exp.lagosDate(p.createdAt),
            payer: p.payerName,
            forText: paymentFor(p),
            institution: p.institution,
            department: p.department,
            level: p.level,
            amount: exp.naira(p.amount),
            status: STATUS_LABEL[p.status] || p.status,
            reference: p.reference,
            receipt: p.receiptNumber || '',
            channel: p.channel || '',
            paidAt: exp.lagosDate(p.paidAt),
          };
          if (isSuper) {
            row.flagReason = p.flagReason || '';
            row.confirmedVia = p.confirmedVia || '';
          }
          return row;
        });
      },
    });
  } catch (err) {
    fail(res, next, err);
  }
}

/* ---------- Handout orders ---------- */

async function handoutOrders(req, res, next) {
  try {
    const filter = orderCtl.buildFilter(clean(req.query));
    const total = await HandoutOrder.countDocuments(filter);

    await exp.sendWorkbook(res, {
      filename: exp.fileName('handout-orders'),
      sheetName: 'Handout orders',
      total,
      columns: [
        { header: 'Date', key: 'date', width: 18 },
        { header: 'Buyer', key: 'buyer', width: 28 },
        { header: 'Email', key: 'email', width: 30 },
        { header: 'Phone', key: 'phone', width: 16 },
        { header: 'Institution', key: 'institution', width: 26 },
        { header: 'Department', key: 'department', width: 26 },
        { header: 'Level', key: 'level', width: 14 },
        { header: 'Delivery', key: 'delivery', width: 12 },
        { header: 'Pickup code', key: 'code', width: 14 },
        { header: 'Pickup status', key: 'pickup', width: 14 },
        { header: 'Collected on', key: 'collectedAt', width: 18 },
        { header: 'Collected by', key: 'collectedBy', width: 22 },
        { header: 'Buyer type', key: 'buyerType', width: 14 },
        { header: 'Matched by', key: 'matchedBy', width: 12 },
        { header: 'Amount (NGN)', key: 'amount', width: 16 },
        { header: 'Reference', key: 'reference', width: 20 },
        { header: 'Receipt number', key: 'receipt', width: 16 },
      ],
      fetchPage: async (skip, limit) => {
        const docs = await HandoutOrder.find(filter)
          .populate(orderCtl.POPULATE)
          .sort({ createdAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return docs.map((d) => {
          const o = orderCtl.toRow(d);
          let pickup = '';
          if (o.delivery === 'pickup') pickup = o.pickupStatus === 'collected' ? 'Collected' : 'Waiting';
          return {
            date: exp.lagosDate(o.createdAt),
            buyer: o.buyerName,
            email: o.buyerEmail,
            phone: o.buyerPhone,
            institution: o.institution,
            department: o.department,
            level: o.level,
            delivery: o.delivery === 'pdf' ? 'PDF' : 'Pickup',
            code: o.pickupCode || '',
            pickup,
            collectedAt: exp.lagosDate(o.collectedAt),
            collectedBy: o.collectedBy || '',
            buyerType: o.isStudent ? 'Student' : 'Non-student',
            matchedBy: o.matchedBy || '',
            amount: exp.naira(o.amount),
            reference: o.reference || '',
            receipt: o.receiptNumber || '',
          };
        });
      },
    });
  } catch (err) {
    fail(res, next, err);
  }
}

/* ---------- Submissions ---------- */

async function submissions(req, res, next) {
  try {
    // The list never includes token details, so manual and reissued tokens stay hidden from the Admin role
    const filter = await submissionCtl.buildFilter(clean(req.query));
    const total = await Submission.countDocuments(filter);

    await exp.sendWorkbook(res, {
      filename: exp.fileName('submissions'),
      sheetName: 'Submissions',
      total,
      columns: [
        { header: 'Uploaded', key: 'uploadedAt', width: 18 },
        { header: 'Student', key: 'student', width: 28 },
        { header: 'Institution', key: 'institution', width: 26 },
        { header: 'Department', key: 'department', width: 26 },
        { header: 'Level', key: 'level', width: 14 },
        { header: 'File name', key: 'fileName', width: 36 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Size (KB)', key: 'kb', width: 12 },
      ],
      fetchPage: async (skip, limit) => {
        const docs = await Submission.find(filter)
          .populate(submissionCtl.POPULATE)
          .sort({ uploadedAt: -1, _id: -1 })
          .skip(skip)
          .limit(limit)
          .lean();
        return docs.map((d) => {
          const s = submissionCtl.toRow(d);
          return {
            uploadedAt: exp.lagosDate(s.uploadedAt),
            student: s.studentName,
            institution: s.institution,
            department: s.department,
            level: s.level,
            fileName: s.fileName,
            type: s.extension ? s.extension.toUpperCase() : '',
            kb: Math.max(1, Math.round((s.bytes || 0) / 1024)),
          };
        });
      },
    });
  } catch (err) {
    fail(res, next, err);
  }
}

module.exports = { students, payments, handoutOrders, submissions };