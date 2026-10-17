(function () {
  'use strict';

  // Keep this in step with the server's allowed types (fileService). The server is the final check.
  var ALLOWED = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'jpg', 'jpeg', 'png', 'webp'];
  var MAX_BYTES = 5 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }

  var el = {
    stepToken: $('step-token'), stepUpload: $('step-upload'), stepDone: $('step-done'),
    tokenAlert: $('token-alert'), form: $('token-form'), input: $('token-input'),
    tokenError: $('token-error'), tokenBtn: $('token-btn'),
    code: $('up-code'), paid: $('up-paid'), countdown: $('countdown'), sr: $('sr-timer'),
    expiredBox: $('expired-box'), expiredAlert: $('expired-alert'), upAlert: $('up-alert'),
    types: $('up-types'), dropzone: $('dropzone'), fileInput: $('file-input'),
    count: $('file-count'), list: $('file-list'),
    confirmBox: $('confirm-box'), confirmText: $('confirm-text'),
    confirmYes: $('confirm-yes'), confirmNo: $('confirm-no'),
    uploadBtn: $('upload-btn'),
    doneTitle: $('done-title'), doneText: $('done-text'), doneList: $('done-list')
  };

  var state = {
    code: '', allowed: 0, deadline: 0, files: [],
    uploading: false, locked: false, confirming: false,
    timer: null, said5: false, said1: false
  };

  /* ---------- Small helpers ---------- */

  function filesText(n) { return n + (n === 1 ? ' file' : ' files'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }

  function fmtSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  // Builds an alert with textContent so nothing inserted can be read as HTML
  function notice(box, type, title, lines) {
    box.textContent = '';
    var wrap = document.createElement('div');
    wrap.className = 'alert alert-' + type;
    var strong = document.createElement('strong');
    strong.textContent = title;
    wrap.appendChild(strong);
    [].concat(lines || []).forEach(function (t) {
      if (!t) return;
      var s = document.createElement('span');
      s.textContent = t;
      wrap.appendChild(s);
    });
    box.appendChild(wrap);
  }
  function clearNotice(box) { box.textContent = ''; }

  function say(text) { el.sr.textContent = text; }

  function showStep(name) {
    el.stepToken.classList.toggle('hidden', name !== 'token');
    el.stepUpload.classList.toggle('hidden', name !== 'upload');
    el.stepDone.classList.toggle('hidden', name !== 'done');
  }

  /* ---------- Token entry ---------- */

  function formatToken(value) {
    var raw = String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.indexOf('ICT') === 0) raw = raw.slice(3);
    return 'ICT-' + raw.slice(0, 12);
  }

  function tokenFromHash() {
    var h = (location.hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* keep as is */ }
    var t = formatToken(h);
    return t.length > 4 ? t : '';
  }

  function setTokenError(message) {
    el.tokenError.textContent = message || '';
    el.tokenError.classList.toggle('hidden', !message);
    el.input.classList.toggle('invalid', !!message);
    if (message) el.input.setAttribute('aria-invalid', 'true');
    else el.input.removeAttribute('aria-invalid');
  }

  el.input.addEventListener('input', function () {
    var f = formatToken(el.input.value);
    if (f !== el.input.value) el.input.value = f;
    setTokenError('');
  });

  el.form.addEventListener('submit', function (e) {
    e.preventDefault();
    var code = formatToken(el.input.value);
    if (code.length <= 4) {
      setTokenError('Enter your token. It starts with ICT-.');
      el.input.focus();
      return;
    }
    unlock(code);
  });

  function unlock(code) {
    clearNotice(el.tokenAlert);
    setTokenError('');
    el.tokenBtn.disabled = true;
    UI.showLoader('Checking your token...');
    Api.post('/submissions/unlock', { token: code }).then(
      function (data) {
        UI.hideLoader();
        el.tokenBtn.disabled = false;
        startUpload(code, data);
      },
      function (err) {
        UI.hideLoader();
        el.tokenBtn.disabled = false;
        showStep('token');
        el.input.value = code;
        notice(el.tokenAlert, 'error', err.message,
          err.code === 'NETWORK'
            ? 'Check your connection and try again.'
            : 'Check the token and try again. If it has expired or been used, pay for a new assignment.');
        el.input.focus();
      }
    );
  }

  /* ---------- Countdown ---------- */

  function applyWindow(data) {
    var secs = Number(data.secondsLeft);
    if (data.secondsLeft === undefined || data.secondsLeft === null || !isFinite(secs)) {
      var t = Date.parse(data.expiresAt);
      secs = isNaN(t) ? 0 : Math.floor((t - Date.now()) / 1000);
    }
    state.deadline = Date.now() + Math.max(0, secs) * 1000;
    state.said5 = false;
    state.said1 = false;
    var n = Number(data.filesAllowed);
    if (isFinite(n) && n > 0) state.allowed = n;
  }

  function remaining() { return Math.max(0, Math.ceil((state.deadline - Date.now()) / 1000)); }

  function tick() {
    if (state.locked) return;
    var s = remaining();
    el.countdown.textContent = pad(Math.floor(s / 60)) + ':' + pad(s % 60);
    el.countdown.classList.toggle('countdown-warn', s < 300 && s >= 60);
    el.countdown.classList.toggle('countdown-low', s < 60);

    if (s > 0 && s < 60 && !state.said1) {
      state.said1 = true; state.said5 = true;
      say('You have less than 1 minute left.');
    } else if (s >= 60 && s < 300 && !state.said5) {
      state.said5 = true;
      say('You have less than 5 minutes left.');
    }
    // If an upload is running, wait for its result before closing the page
    if (s === 0 && !state.uploading) {
      lock('Time is up', 'The files you chose were not sent. Pay again to get a new token.', true);
    }
  }

  function startTimer() {
    clearInterval(state.timer);
    tick();
    state.timer = setInterval(tick, 1000);
  }

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && state.timer) tick();
  });

  function lock(title, text, timeUp) {
    state.locked = true;
    state.confirming = false;
    clearInterval(state.timer);
    state.timer = null;
    el.countdown.textContent = timeUp ? '00:00' : '--:--';
    el.countdown.classList.remove('countdown-warn');
    el.countdown.classList.toggle('countdown-low', !!timeUp);
    el.confirmBox.classList.add('hidden');
    notice(el.expiredAlert, 'error', title, text);
    el.expiredBox.classList.remove('hidden');
    say(title);
    refreshControls();
  }

  /* ---------- Upload step ---------- */

  function startUpload(code, data) {
    state.code = code;
    state.files = [];
    state.locked = false;
    state.confirming = false;
    state.allowed = 0;
    applyWindow(data);

    if (state.allowed < 1) {
      showStep('token');
      notice(el.tokenAlert, 'error', 'This token has no files left to upload.',
        'Pay for a new assignment to get another token.');
      return;
    }

    el.code.textContent = state.code;
    el.paid.textContent = 'You paid for ' + filesText(state.allowed) + '.';
    el.types.textContent = 'Allowed: ' + ALLOWED.map(function (x) { return x.toUpperCase(); }).join(', ') +
      '. Up to 5 MB each.';
    el.fileInput.setAttribute('accept', ALLOWED.map(function (x) { return '.' + x; }).join(','));
    el.expiredBox.classList.add('hidden');
    clearNotice(el.upAlert);
    renderFiles();
    showStep('upload');
    startTimer();
  }

  function checkFile(f) {
    var m = /\.([^.]+)$/.exec(f.name);
    var ext = m ? m[1].toLowerCase() : '';
    if (ALLOWED.indexOf(ext) < 0) return 'this file type is not allowed.';
    if (f.size === 0) return 'this file is empty.';
    if (f.size > MAX_BYTES) return 'this file is ' + fmtSize(f.size) + '. The limit is 5 MB.';
    return '';
  }

  function isDuplicate(f) {
    return state.files.some(function (x) {
      return x.name === f.name && x.size === f.size && x.lastModified === f.lastModified;
    });
  }

  function hideConfirm() {
    state.confirming = false;
    el.confirmBox.classList.add('hidden');
  }

  function addFiles(fileList) {
    var incoming = Array.prototype.slice.call(fileList || []);
    if (!incoming.length || state.locked || state.uploading) return;
    hideConfirm();

    var problems = [];
    var room = state.allowed - state.files.length;
    var skipped = 0;

    incoming.forEach(function (f) {
      var problem = checkFile(f);
      if (problem) { problems.push(f.name + ': ' + problem); return; }
      if (isDuplicate(f)) { problems.push(f.name + ': already added.'); return; }
      if (room <= 0) { skipped++; return; }
      state.files.push(f);
      room--;
    });

    if (skipped) {
      problems.push(filesText(skipped) + (skipped === 1 ? ' was' : ' were') +
        ' not added. You paid for ' + filesText(state.allowed) + '.');
    }
    if (problems.length) notice(el.upAlert, 'warning', 'Some files were not added', problems);
    else clearNotice(el.upAlert);
    renderFiles();
  }

  function rowHtml(f, index, withRemove) {
    return '<li class="file-chip">' +
      '<span class="file-chip-info"><span class="file-chip-name">' + UI.esc(f.name) + '</span>' +
      '<span class="hint">' + UI.esc(fmtSize(f.size)) + '</span></span>' +
      (withRemove
        ? '<button type="button" class="btn btn-secondary btn-small" data-remove="' + index +
          '" aria-label="Remove ' + UI.esc(f.name) + '">Remove</button>'
        : '') +
      '</li>';
  }

  function renderFiles() {
    el.list.innerHTML = state.files.map(function (f, i) { return rowHtml(f, i, true); }).join('');
    refreshControls();
  }

  function refreshControls() {
    var n = state.files.length;
    var open = !state.locked && !state.uploading;
    var full = n >= state.allowed;
    el.fileInput.disabled = !open || full;
    el.dropzone.classList.toggle('disabled', el.fileInput.disabled);
    el.uploadBtn.disabled = !open || n === 0 || state.confirming;
    el.uploadBtn.textContent = n ? 'Upload ' + filesText(n) : 'Upload files';
    el.count.textContent = n + ' of ' + state.allowed + ' files chosen' +
      (open && full && n ? '. You have chosen all your files.' : '');
  }

  el.fileInput.addEventListener('change', function () {
    addFiles(el.fileInput.files);
    el.fileInput.value = '';
  });

  ['dragenter', 'dragover'].forEach(function (name) {
    el.dropzone.addEventListener(name, function (e) {
      e.preventDefault();
      if (!el.fileInput.disabled) el.dropzone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (name) {
    el.dropzone.addEventListener(name, function () { el.dropzone.classList.remove('dragging'); });
  });
  el.dropzone.addEventListener('drop', function (e) {
    e.preventDefault();
    if (el.fileInput.disabled) return;
    addFiles(e.dataTransfer && e.dataTransfer.files);
  });

  el.list.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-remove]');
    if (!btn || state.uploading || state.locked) return;
    state.files.splice(Number(btn.getAttribute('data-remove')), 1);
    hideConfirm();
    clearNotice(el.upAlert);
    renderFiles();
    var next = el.list.querySelector('button[data-remove]');
    if (next) next.focus();
    else if (!el.fileInput.disabled) el.fileInput.focus();
  });

  /* ---------- Upload ---------- */

  el.uploadBtn.addEventListener('click', function () {
    var n = state.files.length;
    if (!n || state.uploading || state.locked) return;
    if (n < state.allowed) {
      var unused = state.allowed - n;
      el.confirmText.textContent = 'You paid for ' + filesText(state.allowed) + ' but chose ' + n + '. The ' +
        unused + (unused === 1 ? ' unused slot is' : ' unused slots are') + ' lost and cannot be used later.';
      state.confirming = true;
      el.confirmBox.classList.remove('hidden');
      refreshControls();
      el.confirmBox.focus();
      return;
    }
    doUpload();
  });

  el.confirmYes.addEventListener('click', function () { doUpload(); });
  el.confirmNo.addEventListener('click', function () {
    hideConfirm();
    refreshControls();
    if (!el.fileInput.disabled) el.fileInput.focus();
  });

  function doUpload() {
    if (state.uploading || state.locked || !state.files.length) return;
    hideConfirm();
    clearNotice(el.upAlert);
    state.uploading = true;
    refreshControls();

    var fd = new FormData();
    fd.append('token', state.code);
    state.files.forEach(function (f) { fd.append('files', f, f.name); });

    UI.showLoader('Uploading your files...');
    Api.upload('/submissions/upload', fd).then(
      function () {
        UI.hideLoader();
        state.uploading = false;
        showDone();
      },
      function (err) {
        UI.hideLoader();
        state.uploading = false;
        refreshControls();
        notice(el.upAlert, 'error', err.message,
          err.code === 'NETWORK'
            ? 'Your files may not have been sent. We are checking your token now.'
            : 'Nothing was saved. Fix the problem and try again before the time runs out.');
        recheck();
      }
    );
  }

  // After a failed upload, ask the server if the token can still be used
  function recheck() {
    Api.post('/submissions/unlock', { token: state.code }).then(
      function (data) {
        applyWindow(data);
        if (remaining() === 0) tick();
      },
      function (err) {
        if (err.code === 'NETWORK' || err.status === 429 || err.status >= 500) return;
        lock(err.message, 'Pay for a new assignment to get another token.', false);
      }
    );
  }

  function showDone() {
    clearInterval(state.timer);
    state.timer = null;
    var n = state.files.length;
    var unused = state.allowed - n;
    el.doneText.textContent = filesText(n).charAt(0).toUpperCase() + filesText(n).slice(1) +
      (n === 1 ? ' was' : ' were') + ' received. Your token has been used.' +
      (unused > 0 ? ' The ' + unused + (unused === 1 ? ' unused slot is' : ' unused slots are') + ' now closed.' : '');
    el.doneList.innerHTML = state.files.map(function (f, i) { return rowHtml(f, i, false); }).join('');
    showStep('done');
    el.doneTitle.focus();
  }

  /* ---------- Start ---------- */

  $('year').textContent = new Date().getFullYear();

  // Coming back with the browser Back button should not show an old screen
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) location.reload();
  });

  var fromHash = tokenFromHash();
  showStep('token');
  el.input.value = fromHash || 'ICT-';
  if (fromHash) {
    unlock(fromHash);
  } else {
    el.input.focus();
    el.input.setSelectionRange(el.input.value.length, el.input.value.length);
  }
})();