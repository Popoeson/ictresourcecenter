(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var MAX_BYTES = 10 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function fmtSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  var state = { page: 1, totalPages: 1, total: 0, items: [] };
  var requestId = 0;
  var target = null;
  var selected = null;
  var savedMode = '';

  var alertEl = $('page-alert');
  var el = {
    mode: $('mode'), modeSave: $('mode-save'), modeAlert: $('mode-alert'),
    inst: $('f-inst'), dept: $('f-dept'), status: $('f-status'), clear: $('f-clear'),
    summary: $('files-summary'), count: $('files-count'),
    empty: $('files-empty'), wrap: $('files-wrap'), body: $('files-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info'),
    card: $('up-card'), title: $('up-title'), targetText: $('up-target'), note: $('up-note'),
    upAlert: $('up-alert'), dropzone: $('dropzone'), file: $('up-file'),
    chip: $('up-chip'), name: $('up-name'), size: $('up-size'), remove: $('up-remove'),
    btn: $('up-btn'), cancel: $('up-cancel')
  };

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  /* ---------- Delivery mode ---------- */

  function loadMode() {
    Api.get('/admin/handouts/settings').then(function (s) {
      savedMode = s.deliveryMode;
      el.mode.value = s.deliveryMode;
      el.modeSave.disabled = true;
    }, function (err) {
      el.modeAlert.innerHTML = UI.alertHtml('error', err.message, 'Reload the page to try again.');
    });
  }

  el.mode.addEventListener('change', function () {
    el.modeAlert.innerHTML = '';
    el.modeSave.disabled = el.mode.value === savedMode;
  });

  el.modeSave.addEventListener('click', function () {
    el.modeSave.disabled = true;
    el.modeAlert.innerHTML = '';
    UI.showLoader('Saving...');
    Api.put('/admin/handouts/settings', { deliveryMode: el.mode.value }).then(
      function (s) {
        UI.hideLoader();
        savedMode = s.deliveryMode;
        UI.toast('Delivery mode saved', 'success');
      },
      function (err) {
        UI.hideLoader();
        el.modeSave.disabled = false;
        el.modeAlert.innerHTML = UI.alertHtml('error', err.message, '');
      }
    );
  });

  /* ---------- Filters ---------- */

  function resetDept() {
    UI.fillSelect(el.dept, [], { placeholder: 'All departments' });
    el.dept.disabled = true;
  }

  el.inst.addEventListener('change', function () {
    resetDept();
    if (el.inst.value) {
      Api.get('/lookups/departments', { institution: el.inst.value }).then(function (list) {
        UI.fillSelect(el.dept, toOptions(list), { placeholder: 'All departments' });
        el.dept.disabled = false;
      }, function (err) { showAlert('error', err.message, ''); });
    }
    loadList(1);
  });
  el.dept.addEventListener('change', function () { loadList(1); });
  el.status.addEventListener('change', function () { loadList(1); });
  el.clear.addEventListener('click', function () {
    el.inst.value = '';
    el.status.value = '';
    resetDept();
    loadList(1);
  });
  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- List ---------- */

  function filtersActive() { return !!(el.inst.value || el.dept.value || el.status.value); }

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function rowHtml(r) {
    var pdf;
    if (r.file) {
      pdf = UI.badge('Uploaded', 'green') +
        '<div class="hint">' + UI.esc(r.file.originalName) + ' \u00B7 ' + UI.esc(fmtSize(r.file.bytes)) +
        ' \u00B7 ' + UI.esc(UI.fmtDate(r.file.uploadedAt)) + '</div>';
    } else {
      pdf = UI.badge('Missing', 'amber');
    }
    return '<tr>' +
      '<td data-label="Institution">' + UI.esc(r.institution) + '</td>' +
      '<td data-label="Department">' + UI.esc(r.department) + '</td>' +
      '<td data-label="Level"><span class="student-name">' + UI.esc(r.level) + '</span></td>' +
      '<td data-label="PDF">' + pdf + '</td>' +
      '<td class="cell-actions" data-label="Actions">' +
        '<button type="button" class="btn btn-secondary btn-small" data-act="upload" data-level="' + UI.esc(r.levelId) + '">' +
        (r.file ? 'Replace' : 'Upload') + '</button></td>' +
      '</tr>';
  }

  function render(data) {
    var page = Number(data.page) || 1;
    if (!data.items.length && page > 1) { loadList(page - 1); return; }

    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;
    state.items = data.items;

    var s = data.summary;
    el.summary.textContent = s && s.total
      ? 'PDFs uploaded for ' + s.uploaded + ' of ' + s.total + ' level' + (s.total === 1 ? '' : 's') + '.'
      : '';

    if (!data.items.length) {
      el.count.textContent = '';
      showEmpty(filtersActive()
        ? 'No levels match your filters.'
        : 'No levels yet. Add institutions, departments and levels in Structure first.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total;

    el.pager.classList.toggle('hidden', state.totalPages <= 1);
    el.info.textContent = 'Page ' + state.page + ' of ' + state.totalPages;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= state.totalPages;
  }

  function loadList(page) {
    var id = ++requestId;
    clearAlert();
    el.count.textContent = 'Loading...';
    Api.get('/admin/handouts/files', {
      page: page || 1,
      limit: PAGE_SIZE,
      institution: el.inst.value,
      department: el.dept.value,
      status: el.status.value
    }).then(
      function (data) { if (id === requestId) render(data); },
      function (err) {
        if (id !== requestId) return;
        el.count.textContent = '';
        el.wrap.classList.add('hidden');
        el.pager.classList.add('hidden');
        el.empty.classList.add('hidden');
        showAlert('error', err.message, 'Change a filter or reload the page to try again.');
      }
    );
  }

  /* ---------- Upload panel ---------- */

  function renderSelected() {
    if (selected) {
      el.name.textContent = selected.name;
      el.size.textContent = fmtSize(selected.size);
      el.chip.classList.remove('hidden');
    } else {
      el.chip.classList.add('hidden');
    }
    el.btn.disabled = !selected;
  }

  function setFile(file) {
    el.upAlert.innerHTML = '';
    selected = null;
    if (file) {
      if (!/\.pdf$/i.test(file.name)) {
        el.upAlert.innerHTML = UI.alertHtml('error', 'That file type is not allowed.', 'Handouts must be PDF files.');
      } else if (file.size === 0) {
        el.upAlert.innerHTML = UI.alertHtml('error', 'That file is empty.', 'Choose a different PDF.');
      } else if (file.size > MAX_BYTES) {
        el.upAlert.innerHTML = UI.alertHtml('error', 'This file is larger than 10 MB.', 'Make the PDF smaller and try again.');
      } else {
        selected = file;
      }
    }
    if (!selected) el.file.value = '';
    renderSelected();
  }

  el.file.addEventListener('change', function () { setFile(el.file.files[0] || null); });
  el.remove.addEventListener('click', function () { setFile(null); });

  ['dragenter', 'dragover'].forEach(function (type) {
    el.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      el.dropzone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    el.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove('dragging');
    });
  });
  el.dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) setFile(files[0]);
  });

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="upload"]');
    if (!btn) return;
    var id = btn.getAttribute('data-level');
    var item = state.items.filter(function (x) { return x.levelId === id; })[0];
    if (!item) return;

    target = item;
    var replacing = !!item.file;
    el.title.textContent = replacing ? 'Replace handout PDF' : 'Upload handout PDF';
    el.targetText.textContent = item.institution + ' \u00B7 ' + item.department + ' \u00B7 ' + item.level;
    el.note.textContent = replacing
      ? 'The current PDF (' + item.file.originalName + ') will be replaced.'
      : 'Buyers of this level will get this PDF.';
    el.btn.textContent = replacing ? 'Replace PDF' : 'Upload PDF';
    setFile(null);
    el.card.classList.remove('hidden');
    el.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.title.focus({ preventScroll: true });
  });

  function closePanel() {
    target = null;
    setFile(null);
    el.card.classList.add('hidden');
  }
  el.cancel.addEventListener('click', closePanel);

  el.btn.addEventListener('click', function () {
    if (!selected || !target) return;
    el.btn.disabled = true;
    el.upAlert.innerHTML = '';
    var fd = new FormData();
    fd.append('level', target.levelId);
    fd.append('file', selected);
    UI.showLoader('Uploading the PDF...');
    Api.upload('/admin/handouts/files', fd).then(
      function (r) {
        UI.hideLoader();
        closePanel();
        UI.toast(r.replaced ? 'PDF replaced' : 'PDF uploaded', 'success');
        loadList(state.page);
      },
      function (err) {
        UI.hideLoader();
        el.btn.disabled = false;
        el.upAlert.innerHTML = UI.alertHtml('error', err.message, 'Fix the problem and try again.');
        if (err.status === 409) loadList(state.page);
      }
    );
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'handout-settings', roles: ['superadmin'] }).then(function () {
    UI.fillSelect(el.inst, [], { placeholder: 'All institutions' });
    resetDept();
    loadMode();
    Api.get('/lookups/institutions').then(function (list) {
      UI.fillSelect(el.inst, toOptions(list), { placeholder: 'All institutions' });
    }, function (err) {
      showAlert('error', err.message, 'Filters may be missing. Reload the page to try again.');
    });
    loadList(1);
  });
})();