(function () {
  'use strict';

  var PAGE_SIZE = 25;

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function dash() { return '<span class="muted">\u2014</span>'; }

  var state = { page: 1, totalPages: 1, total: 0 };
  var requestId = 0;
  var searchTimer = null;

  var alertEl = $('page-alert');
  var el = {
    q: $('f-q'), inst: $('f-inst'), level: $('f-level'), status: $('f-status'),
    clear: $('f-clear'), exportBtn: $('export-btn'),
    count: $('list-count'), empty: $('list-empty'), wrap: $('list-wrap'), body: $('list-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info')
  };

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  /* ---------- Fee amounts (read only) ---------- */

  function renderAmounts(list) {
    $('amounts-status').textContent = '';
    var rows = [];
    list.forEach(function (block) {
      block.levels.forEach(function (l) {
        rows.push('<tr>' +
          '<td data-label="Institution">' + UI.esc(block.institution.name) + '</td>' +
          '<td data-label="Level">' + UI.esc(l.levelLabel) + '</td>' +
          '<td data-label="Departmental fee">' +
            (l.departmentalFee === null ? UI.badge('Not set', 'amber') : UI.esc(UI.naira(l.departmentalFee))) +
          '</td></tr>');
      });
    });
    if (!rows.length) {
      $('amounts-empty').classList.remove('hidden');
      return;
    }
    $('amounts-body').innerHTML = rows.join('');
    $('amounts-wrap').classList.remove('hidden');
  }

  function loadAmounts() {
    Api.get('/admin/departmental-fee/amounts').then(renderAmounts, function (err) {
      $('amounts-status').textContent = '';
      showAlert('error', err.message, 'Reload the page to try again.');
    });
  }

  /* ---------- Filters ---------- */

  function resetLevel() {
    UI.fillSelect(el.level, [], { placeholder: 'All levels' });
    el.level.disabled = true;
  }

  el.inst.addEventListener('change', function () {
    resetLevel();
    if (el.inst.value) {
      Api.get('/lookups/levels', { institution: el.inst.value }).then(function (list) {
        UI.fillSelect(el.level, list, { value: 'key', label: 'name', placeholder: 'All levels' });
        el.level.disabled = false;
      }, function (err) { showAlert('error', err.message, ''); });
    }
    loadList(1);
  });

  [el.level, el.status].forEach(function (c) {
    c.addEventListener('change', function () { loadList(1); });
  });

  el.q.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadList(1); }, 300);
  });

  el.clear.addEventListener('click', function () {
    el.q.value = '';
    el.inst.value = '';
    el.status.value = '';
    resetLevel();
    loadList(1);
  });

  function params() {
    return { q: el.q.value.trim(), institution: el.inst.value, levelKey: el.level.value, status: el.status.value };
  }

  function filtersActive() {
    var p = params();
    return !!(p.q || p.institution || p.levelKey || p.status);
  }

  /* ---------- List ---------- */

  function statusCell(s) {
    if (!s.paid) return UI.badge('Not paid', 'grey');
    var hint = [s.amount !== null ? UI.naira(s.amount) : '', s.paidAt ? UI.fmtDate(s.paidAt) : ''].filter(Boolean).join(' \u00B7 ');
    return UI.badge('Paid', 'green') + (hint ? '<div class="hint">' + UI.esc(hint) + '</div>' : '');
  }

  function rowHtml(s) {
    var contact = [s.phone, s.email].filter(Boolean).join(' \u00B7 ');
    var receipt = s.paid && s.reference
      ? '<a class="text-link-inline" href="/api/receipts/' + encodeURIComponent(s.reference) + '" download>Receipt</a>'
      : dash();
    return '<tr>' +
      '<td data-label="Student"><span class="student-name">' + UI.esc(s.name) + '</span>' +
        (s.department ? '<div class="hint">' + UI.esc(s.department) + '</div>' : '') + '</td>' +
      '<td data-label="Institution">' + UI.esc(s.institution || '\u2014') + '</td>' +
      '<td data-label="Level">' + UI.esc(s.level || '\u2014') + '</td>' +
      '<td data-label="Contact">' + (contact ? UI.esc(contact) : dash()) + '</td>' +
      '<td data-label="Departmental fee">' + statusCell(s) + '</td>' +
      '<td class="cell-actions" data-label="Receipt">' + receipt + '</td>' +
      '</tr>';
  }

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function renderSummary(s) {
    if (!s) return;
    $('st-students').textContent = Number(s.students).toLocaleString('en-NG');
    $('st-paid').textContent = Number(s.paid).toLocaleString('en-NG');
    $('st-unpaid').textContent = Number(s.unpaid).toLocaleString('en-NG');
    $('st-collected').textContent = UI.naira(s.collected);
  }

  function render(data) {
    var page = Number(data.page) || 1;
    if (!data.items.length && page > 1) { loadList(page - 1); return; }

    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;
    renderSummary(data.summary);

    if (!data.items.length) {
      el.count.textContent = '';
      showEmpty(filtersActive()
        ? 'No students match your filters.'
        : 'No Computer Science students yet. Add the department in Structure and import or add students.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' student' + (state.total === 1 ? '' : 's');

    el.pager.classList.toggle('hidden', state.totalPages <= 1);
    el.info.textContent = 'Page ' + state.page + ' of ' + state.totalPages;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= state.totalPages;
  }

  function loadList(page) {
    var id = ++requestId;
    clearAlert();
    el.count.textContent = 'Loading students...';
    var p = params();
    Api.get('/admin/departmental-fee', {
      page: page || 1, limit: PAGE_SIZE,
      q: p.q, institution: p.institution, levelKey: p.levelKey, status: p.status
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

  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Export ---------- */

  el.exportBtn.addEventListener('click', function () {
    clearAlert();
    el.exportBtn.disabled = true;
    UI.showLoader('Preparing your download...');
    Api.download('/admin/export/../departmental-fee/export'.replace('/export/../', '/'), params()).then(
      function () { UI.hideLoader(); el.exportBtn.disabled = false; UI.toast('Export downloaded', 'success'); },
      function (err) {
        UI.hideLoader();
        el.exportBtn.disabled = false;
        showAlert(err.status === 400 || err.status === 404 ? 'warning' : 'error', err.message, '');
      }
    );
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'departmental' }).then(function (admin) {
    $('amounts-note').innerHTML = admin.role === 'superadmin'
      ? 'Change these amounts on the <a class="text-link-inline" href="/admin/prices.html">Prices page</a>.'
      : 'Only the Super Admin can change these amounts.';

    UI.fillSelect(el.inst, [], { placeholder: 'All institutions' });
    Api.get('/lookups/institutions').then(function (list) {
      UI.fillSelect(el.inst, toOptions(list), { placeholder: 'All institutions' });
    }, function (err) {
      showAlert('error', err.message, 'Filters may be missing. Reload the page to try again.');
    });
    resetLevel();
    loadAmounts();
    loadList(1);
  });
})();