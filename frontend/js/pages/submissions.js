(function () {
  'use strict';

  var PAGE_SIZE = 25;

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function fmtSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  var isSuper = false;
  var items = {};
  var state = { page: 1, totalPages: 1, total: 0 };
  var requestId = 0;
  var searchTimer = null;

  var alertEl = $('page-alert');
  var el = {
    q: $('f-q'), inst: $('f-inst'), dept: $('f-dept'), level: $('f-level'),
    from: $('f-from'), to: $('f-to'), clear: $('f-clear'),
    count: $('subs-count'), empty: $('subs-empty'), wrap: $('subs-wrap'), body: $('subs-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info'),
    zipSel: $('zip-selected'), zipAll: $('zip-all'), checkAll: $('check-all')

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  /* ---------- Lookups for the filters ---------- */

  function resetSelect(select, placeholder) {
    UI.fillSelect(select, [], { placeholder: placeholder });
    select.disabled = true;
  }

  el.inst.addEventListener('change', function () {
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    if (el.inst.value) {
      Api.get('/lookups/departments', { institution: el.inst.value }).then(function (list) {
        UI.fillSelect(el.dept, toOptions(list), { placeholder: 'All departments' });
        el.dept.disabled = false;
      }, function (err) { showAlert('error', err.message, ''); });
    }
    loadList(1);
  });

  el.dept.addEventListener('change', function () {
    resetSelect(el.level, 'All levels');
    if (el.dept.value) {
      Api.get('/lookups/levels', { department: el.dept.value }).then(function (list) {
        UI.fillSelect(el.level, toOptions(list), { placeholder: 'All levels' });
        el.level.disabled = false;
      }, function (err) { showAlert('error', err.message, ''); });
    }
    loadList(1);
  });

  /* ---------- List ---------- */

  function filtersActive() {
    return !!(el.q.value.trim() || el.inst.value || el.dept.value || el.level.value || el.from.value || el.to.value);
  }

  function rowHtml(s) {
    var klass = [s.institution, s.department, s.level].filter(Boolean).join(' \u00B7 ');
    var meta = [s.extension ? s.extension.toUpperCase() : '', fmtSize(s.bytes)].filter(Boolean).join(' \u00B7 ');
    var id = UI.esc(s.id);

    var actions = '<a class="text-link-inline" href="/api/admin/submissions/' + encodeURIComponent(s.id) +
      '/download" download>Download</a>';
    if (isSuper) {
      actions += '<button type="button" class="icon-btn icon-btn-sm" data-act="delete" data-id="' + id +
        '" aria-label="Delete ' + UI.esc(s.fileName) + '">' + UI.icon('trash', 20) + '</button>';
    }

    return '<tr>' +
      '<td class="col-check" data-label="Select"><input type="checkbox" class="row-check" data-id="' + id +
        '" aria-label="Select ' + UI.esc(s.fileName) + '"></td>' +
      '<td data-label="Uploaded">' + UI.esc(UI.fmtDate(s.uploadedAt)) + '</td>' +
      '<td data-label="Student"><span class="student-name">' + UI.esc(s.studentName || '\u2014') + '</span></td>' +
      '<td data-label="Class">' + UI.esc(klass || '\u2014') + '</td>' +
      '<td data-label="File"><span class="student-name">' + UI.esc(s.fileName) + '</span>' +
        (meta ? '<div class="hint">' + UI.esc(meta) + '</div>' : '') + '</td>' +
      '<td class="cell-actions" data-label="Actions">' + actions + '</td>' +
      '</tr>';
  }

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function render(data) {
    var page = Number(data.page) || 1;
    if (!data.items.length && page > 1) { loadList(page - 1); return; }

    items = {};
    data.items.forEach(function (s) { items[s.id] = s; });
    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;

    if (!data.items.length) {
      el.count.textContent = '';
      showEmpty(filtersActive() ? 'No submissions yet for this filter.' : 'No submissions yet.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' file' + (state.total === 1 ? '' : 's');

    el.pager.classList.toggle('hidden', state.totalPages <= 1);
    el.info.textContent = 'Page ' + state.page + ' of ' + state.totalPages;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= state.totalPages;
  }

  function loadList(page) {
    if (el.from.value && el.to.value && el.from.value > el.to.value) {
      showAlert('warning', 'The "From" date is after the "To" date.', 'Change one of them.');
      return;
    }
    var id = ++requestId;
    clearAlert();
    el.count.textContent = 'Loading submissions...';
    Api.get('/admin/submissions', {
      page: page || 1,
      limit: PAGE_SIZE,
      q: el.q.value.trim(),
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      from: el.from.value,
      to: el.to.value
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

  /* ---------- Filter events ---------- */

  el.q.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadList(1); }, 300);
  });
  [el.level, el.from, el.to].forEach(function (c) {
    c.addEventListener('change', function () { loadList(1); });
  });

  el.clear.addEventListener('click', function () {
    el.q.value = '';
    el.inst.value = '';
    el.from.value = '';
    el.to.value = '';
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadList(1);
  });

  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Delete (Super Admin) ---------- */

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="delete"]');
    if (!btn) return;
    var s = items[btn.getAttribute('data-id')];
    if (!s) return;

    UI.confirm({
      title: 'Delete submission?',
      message: s.fileName + ' from ' + (s.studentName || 'this student') +
        ' will be hidden from the lists. The record and the stored file are kept.',
      confirmText: 'Delete',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      UI.showLoader('Deleting...');
      Api.del('/admin/submissions/' + encodeURIComponent(s.id)).then(
        function () {
          UI.hideLoader();
          UI.toast('Submission deleted', 'success');
          loadList(state.page);
        },
        function (err) {
          UI.hideLoader();
          showAlert('error', err.message, '');
          if (err.status === 404) loadList(state.page);
        }
      );
    });
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'submissions' }).then(function (admin) {
    isSuper = admin.role === 'superadmin';
    if (!isSuper) {
      $('page-sub').textContent = 'Assignment files uploaded by students. You have view and download access.';
    }
    UI.fillSelect(el.inst, [], { placeholder: 'All institutions' });
    Api.get('/lookups/institutions').then(function (list) {
      UI.fillSelect(el.inst, toOptions(list), { placeholder: 'All institutions' });
    }, function (err) {
      showAlert('error', err.message, 'Filters may be missing. Reload the page to try again.');
    });
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadList(1);
  });
})();