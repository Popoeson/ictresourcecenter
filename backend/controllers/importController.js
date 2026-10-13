const { ImportBatch } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const auditService = require('../services/auditService');
const { runImport, buildErrorWorkbook, buildTemplateWorkbook } = require('../services/importService');

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

async function sendWorkbook(res, wb, filename) {
  res.setHeader('Content-Type', XLSX_TYPE);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

async function importStudents(req, res, next) {
  try {
    if (!req.file) throw new AppError('Choose a file to upload.', 400, 'NO_FILE');
    const batch = await runImport(req.file, req.admin._id);
    await auditService.log(req, {
      action: 'import.run',
      entityType: 'importBatch',
      entityId: batch._id,
      after: { fileName: batch.fileName, counts: batch.counts },
    });
    send(res, {
      batchId: batch._id,
      fileName: batch.fileName,
      counts: batch.counts,
      hasErrorFile: batch.counts.rejected > 0,
    });
  } catch (err) {
    next(err);
  }
}

async function listBatches(req, res, next) {
  try {
    const items = await ImportBatch.find()
      .select('-rowErrors')
      .populate('uploadedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(20);
    send(res, items);
  } catch (err) {
    next(err);
  }
}

async function errorFile(req, res, next) {
  try {
    const batch = await ImportBatch.findById(req.params.id);
    if (!batch) throw new AppError('Import not found.', 404, 'NOT_FOUND');
    if (!batch.rowErrors || batch.rowErrors.length === 0) {
      throw new AppError('This import has no rejected rows.', 404, 'NOT_FOUND');
    }
    await sendWorkbook(res, buildErrorWorkbook(batch), 'rejected-rows.xlsx');
  } catch (err) {
    next(err);
  }
}

async function template(req, res, next) {
  try {
    await sendWorkbook(res, buildTemplateWorkbook(), 'student-import-template.xlsx');
  } catch (err) {
    next(err);
  }
}

module.exports = { importStudents, listBatches, errorFile, template };