const { Student, Setting, Submission } = require('../models');
const { AppError } = require('../middleware/errorHandler');
const tokenService = require('../services/tokenService');
const fileService = require('../services/fileService');
const logger = require('../config/logger');

function send(res, data, status = 200) {
  res.status(status).json({ success: true, data });
}

function cleanName(name) {
  const base = String(name || 'file').split(/[\\/]/).pop().replace(/[\u0000-\u001f]/g, '').trim();
  return (base || 'file').slice(0, 200);
}

async function loadSettings() {
  const s = await Setting.findOne({ key: 'global' }).lean();
  return {
    maxBytes: (s && s.maxFileSizeBytes) || 5 * 1024 * 1024,
    allowedExtensions: s && s.allowedExtensions && s.allowedExtensions.length ? s.allowedExtensions : undefined,
  };
}

// Checks a token without using it. The upload page then shows the picker and the countdown.
async function unlock(req, res, next) {
  try {
    const token = await tokenService.checkUsable(req.body.token);
    send(res, {
      code: token.code,
      filesAllowed: token.filesAllowed,
      expiresAt: token.expiresAt,
      secondsLeft: Math.max(0, Math.floor((token.expiresAt.getTime() - Date.now()) / 1000)),
    });
  } catch (err) {
    next(err);
  }
}

// Token plus files in one request. Only one request can claim a token.
async function upload(req, res, next) {
  let token = null;
  const stored = [];

  try {
    const code = tokenService.normaliseCode(req.body && req.body.token);
    if (!code) throw new AppError('That token is not valid. Check it and try again.', 404, 'TOKEN_INVALID');

    const files = req.files || [];
    if (!files.length) throw new AppError('Choose at least one file to upload.', 400, 'NO_FILES');

    token = await tokenService.claim(code);
    if (!token) {
      // Not claimable: this throws the right message (invalid, used, expired or busy)
      await tokenService.checkUsable(code);
      throw new AppError('This token is being used right now. Please wait a moment.', 409, 'TOKEN_BUSY');
    }

    try {
      if (files.length > token.filesAllowed) {
        const extra = files.length - token.filesAllowed;
        throw new AppError(
          'You paid for ' + token.filesAllowed + ' file' + (token.filesAllowed === 1 ? '' : 's') +
            '. Remove ' + extra + ' file' + (extra === 1 ? '' : 's') + ' and try again.',
          400,
          'TOO_MANY_FILES'
        );
      }

      const student = await Student.findOne({ _id: token.student, isDeleted: false })
        .populate('institution', 'name')
        .populate('level', 'name');
      if (!student || !student.institution || !student.level) {
        throw new AppError('We could not find your student record. Please contact your course lecturer.', 404, 'NOT_FOUND');
      }

      // Check every file first, so a bad file stores nothing
      const settings = await loadSettings();
      const problems = [];
      const checked = [];
      for (const f of files) {
        const r = await fileService.validateFile(f, settings);
        if (r.ok) checked.push({ file: f, extension: r.extension, resourceType: r.resourceType });
        else problems.push('"' + cleanName(f.originalname) + '": ' + r.reason);
      }
      if (problems.length) throw new AppError(problems.join(' '), 400, 'FILE_REJECTED');

      const folder = fileService.assignmentFolder(student.institution.name, student.level.name);
      for (const c of checked) {
        const info = await fileService.uploadBuffer({
          buffer: c.file.buffer,
          folder,
          extension: c.extension,
          resourceType: c.resourceType,
        });
        stored.push({ info, c });
      }

      await Submission.insertMany(
        stored.map(({ info, c }) => ({
          student: student._id,
          token: token._id,
          institution: student.institution._id,
          department: student.department,
          level: student.level._id,
          file: {
            publicId: info.publicId,
            resourceType: info.resourceType,
            deliveryType: info.deliveryType,
            format: info.format,
            bytes: info.bytes,
            originalName: cleanName(c.file.originalname),
            mimeType: c.file.mimetype,
            extension: c.extension,
          },
        }))
      );

      await tokenService.finish(token._id, stored.length);
    } catch (err) {
      // Nothing is kept. The token is given back while its window is still open.
      try {
        await Promise.all(stored.map(({ info }) => fileService.destroy(info.publicId, info.resourceType)));
        await Submission.deleteMany({ token: token._id });
        await tokenService.release(token._id);
      } catch (cleanupErr) {
        logger.error({ err: cleanupErr.message }, 'Upload clean-up failed');
      }
      throw err;
    }

    logger.info({ token: token.code, files: stored.length }, 'Assignment files submitted');
    send(
      res,
      {
        filesAllowed: token.filesAllowed,
        filesUploaded: stored.length,
        forfeited: token.filesAllowed - stored.length,
        files: stored.map(({ c }) => ({ name: cleanName(c.file.originalname), size: c.file.size })),
      },
      201
    );
  } catch (err) {
    next(err);
  }
}

module.exports = { unlock, upload };