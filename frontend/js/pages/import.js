(function () {
  'use strict';

  var MAX_BYTES = 5 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }

  var alertEl = $('page-alert');
  var resultEl = $('import-result');
  var dropzone = $('dropzone');
  var fileInput = $('import-file');
  var chip = $('file-chip');
  var importBtn = $('import-btn');
  var selected = null;

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  function sizeText(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  /* ---------- File selection ---------- */

  function renderSelected() {
    if (selected) {
      $('file-name').textContent = selected.name;
      $('file-size').textContent = sizeText(selected.size);
      chip.classList.remove('hidden');
    } else {
      chip.classList.add('hidden');
    }
    importBtn.disabled = !selected;
  }

  function setFile(file) {
    clearAlert();
    selected = null;
    if (file) {
      if (!/\.(xlsx|csv)$/i.test(file.name)) {
        showAlert('error', 'That file type is not allowed.', 'Use an Excel (.xlsx) or CSV file.');
      } else if (file.size === 0) {
        showAlert('error', 'That file is empty.', 'Choose a file with student rows.');
      } else if (file.size > MAX_BYTES) {
        showAlert('error', 'This file is larger than 5 MB.', 'Split it and upload in parts.');
      } else {
        selected = file;
      }
    }
    if (!selected) fileInput.value = '';
    renderSelected();
  }

  fileInput.addEventListener('change', function () { setFile(fileInput.files[0] || null); });
  $('file-remove').addEventListener('click', function () { setFile(null); });

  ['dragenter', 'dragover'].forEach(function (type) {
    dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dropzone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      dropzone.classList.remove('dragging');
    });
  });
  dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) setFile(files[0]);
  });

  /* ---------- Upload ---------- */

  function statCard(value, label) {
    return '<div class="stat-card"><div class="stat-value">' + UI.esc(value) + '</div>' +
      '<div class="stat-label">' + UI.esc(label) + '</div></div>';
  }

  function showResult(r) {
    var c = r.counts || {};
    var added = c.added || 0;
    var rejected = c.rejected || 0;
    var alert;
    if (rejected > 0) {
      alert = UI.alertHtml('warning', 'Import finished with rejected rows.',
        'Download the rejected rows, fix them and upload that file again.');
    } else if (added > 0) {
      alert = UI.alertHtml('success', 'Import complete.', added + ' student' + (added === 1 ? '' : 's') + ' added.');
    } else {
      alert = UI.alertHtml('info', 'Nothing new to add.', 'Every row was already in the student list.');
    }

    var download = r.hasErrorFile
      ? '<div class="btn-row"><a class="btn btn-secondary" href="/api/admin/import/' + encodeURIComponent(r.batchId) +
        '/errors" download>Download rejected rows</a></div>'
      : '';

    resultEl.innerHTML = alert +
      '<p class="hint">' + UI.esc(r.fileName) + ' \u00B7 ' + (c.total || 0) + ' rows read</p>' +
      '<div class="import-stats">' +
        statCard(added, 'Added') +
        statCard(c.duplicates || 0, 'Skipped as duplicates') +
        statCard(rejected, 'Rejected') +
      '</div>' + download;
  }

  importBtn.addEventListener('click', function () {
    if (!selected) return;
    clearAlert();
    resultEl.innerHTML = '';
    var fd = new FormData();
    fd.append('file', selected);
    importBtn.disabled = true;
    UI.showLoader('Importing students...');
    Api.upload('/admin/import', fd).then(
      function (r) {
        UI.hideLoader();
        showResult(r);
        setFile(null);
        loadBatches();
      },
      function (err) {
        UI.hideLoader();
        importBtn.disabled = false;
        showAlert('error', err.message, 'Fix the problem and try again.');
      }
    );
  });

  /* ---------- Recent imports ---------- */

  function batchRow(b) {
    var c = b.counts || {};
    var rejected = c.rejected || 0;
    var link = rejected > 0
      ? '<a class="text-link-inline" href="/api/admin/import/' + encodeURIComponent(b._id) + '/errors" download>Rejected rows</a>'
      : '<span class="muted">\u2014</span>';
    return '<tr>' +
      '<td data-label="File"><span class="student-name">' + UI.esc(b.fileName || '') + '</span></td>' +
      '<td data-label="Uploaded by">' + UI.esc(b.uploadedBy && b.uploadedBy.name ? b.uploadedBy.name : '\u2014') + '</td>' +
      '<td data-label="Date">' + UI.esc(UI.fmtDate(b.createdAt)) + '</td>' +
      '<td data-label="Rows">' + (c.total || 0) + '</td>' +
      '<td data-label="Added">' + (c.added || 0) + '</td>' +
      '<td data-label="Duplicates">' + (c.duplicates || 0) + '</td>' +
      '<td data-label="Rejected">' + rejected + '</td>' +
      '<td data-label="Rejected file">' + link + '</td>' +
      '</tr>';
  }

  function loadBatches() {
    var status = $('batches-status');
    status.textContent = 'Loading...';
    Api.get('/admin/import/batches').then(
      function (list) {
        status.textContent = '';
        if (!list.length) {
          $('batches-empty').classList.remove('hidden');
          $('batches-wrap').classList.add('hidden');
          return;
        }
        $('batches-empty').classList.add('hidden');
        $('batches-body').innerHTML = list.map(batchRow).join('');
        $('batches-wrap').classList.remove('hidden');
      },
      function (err) {
        status.textContent = '';
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  }

  /* ---------- Start ---------- */

  Auth.init({ page: 'import', roles: ['superadmin'] }).then(function () {
    $('dropzone-icon').innerHTML = UI.icon('upload', 32);
    renderSelected();
    loadBatches();
  });
})();