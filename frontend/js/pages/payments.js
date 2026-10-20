(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var TYPE_LABEL = { ict_fee: 'ICT fee', departmental_fee: 'Departmental fee', assignment: 'Assignment', handout: 'Handout' };

  var STATUS = {
    success: ['Paid', 'green'],
    pending: ['Pending', 'amber'],
    flagged: ['Flagged', 'red'],
    failed: ['Failed', 'red'],
    abandoned: ['Abandoned', 'grey']
  };

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }

  var isSuper = false;
  var state = { page: 1, totalPages: 1, total: 0 };
  var requestId = 0;
  var searchTimer = null;

  var alertEl = $('page-alert');
  var el = {
    q: $('f-q'), type: $('f-type'), status: $('f-status'),
    inst: $('f-inst'), dept: $('f-dept'), level: $('f-level'),
    from: $('f-from'), to: $('f-to'), clear: $('f-clear'),
    count: $('payments-count'), empty: $('payments-empty'),
    wrap: $('payments-wrap'), body: $('payments-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info'),
    stats: $('stat-grid')
  };

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
    return !!(el.q.value.trim() || el.type.value || el.status.value || el.inst.value ||
      el.dept.value || el.level.value || el.from.value || el.to.value);
  }

  function forText(p) {
    var text = TYPE_LABEL[p.type] || p.type;
    if (p.type === 'assignment' && p.fileCount) text += ' \u00B7 ' + p.fileCount + (p.fileCount === 1 ? ' file' : ' files');
    if (p.type === 'handout' && p.delivery) text += ' \u00B7 ' + (p.delivery === 'pdf' ? 'PDF' : 'Pickup');
    return text;
  }

  function statusCell(p) {
    var s = STATUS[p.status] || [p.status, 'grey'];
    var html = UI.badge(s[0], s[1]);
    if (isSuper && p.status === 'flagged' && p.flagReason) {
      html += '<div class="hint">' + UI.esc(p.flagReason) + '</div>';
    }
    return html;
  }

  function actionsCell(p) {
    var html = '';
        if (p.status === 'success' && p.type === 'ict_fee') {
      html = '<a class="text-link-inline" href="/api/receipts/' + encodeURIComponent(p.reference) + '" download>Receipt</a>';
    } else if (isSuper && p.status === 'pending') {
      html = '<button type="button" class="btn btn-secondary btn-small" data-act="reverify" data-id="' + UI.esc(p.id) + '">Re-verify</button>';
    } else {
      html = '<span class="muted">\u2014</span>';
    }
    return '<td class="cell-actions" data-label="Actions">' + html + '</td>';
  }

  function rowHtml(p) {
    var klass = [p.institution, p.department, p.level].filter(Boolean).join(' \u00B7 ');
    return '<tr>' +
      '<td data-label="Date">' + UI.esc(UI.fmtDate(p.createdAt)) + '</td>' +
      '<td data-label="Paid by"><span class="student-name">' + UI.esc(p.payerName || '\u2014') + '</span></td>' +
      '<td data-label="Payment for">' + UI.esc(forText(p)) + '</td>' +
      '<td data-label="Class">' + UI.esc(klass || '\u2014') + '</td>' +
      '<td data-label="Amount">' + UI.esc(UI.naira(p.amount)) + '</td>' +
      '<td data-label="Status">' + statusCell(p) + '</td>' +
      '<td data-label="Reference">' + UI.esc(p.reference) +
        (p.receiptNumber ? '<div class="hint">' + UI.esc(p.receiptNumber) + '</div>' : '') + '</td>' +
      actionsCell(p) + '</tr>';
  }

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function renderSummary(s) {
    if (!s) return;
    $('st-total').textContent = UI.naira(s.collectedTotal);
    $('st-count').textContent = String(s.collectedCount);
    $('st-pending').textContent = String(s.pendingCount);
    $('st-flagged').textContent = String(s.flaggedCount);
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
      showEmpty(filtersActive() ? 'No payments match your filters.' : 'No payments yet.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' payment' + (state.total === 1 ? '' : 's');

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
    el.count.textContent = 'Loading payments...';
    Api.get('/admin/payments', {
      page: page || 1,
      limit: PAGE_SIZE,
      q: el.q.value.trim(),
      type: el.type.value,
      status: el.status.value,
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
  [el.type, el.status, el.level, el.from, el.to].forEach(function (c) {
    c.addEventListener('change', function () { loadList(1); });
  });

  el.clear.addEventListener('click', function () {
    el.q.value = '';
    el.type.value = '';
    el.status.value = '';
    el.inst.value = '';
    el.from.value = '';
    el.to.value = '';
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadList(1);
  });

  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Re-verify (Super Admin) ---------- */

  var OUTCOME = {
    success: ['Payment confirmed', 'success'],
    not_completed: ['Paystack says this payment was not completed.', 'info'],
    processing: ['Paystack could not confirm it yet. Try again shortly.', 'info'],
    flagged: ['This payment was flagged. See the reason in the list.', 'error']
  };

  function reverify(btn) {
    btn.disabled = true;
    UI.showLoader('Checking with Paystack...');
    Api.post('/admin/payments/' + encodeURIComponent(btn.getAttribute('data-id')) + '/reverify').then(
      function (r) {
        UI.hideLoader();
        var o = OUTCOME[r.outcome] || ['Checked.', 'info'];
        UI.toast(o[0], o[1]);
        loadList(state.page);
      },
      function (err) {
        UI.hideLoader();
        btn.disabled = false;
        showAlert('error', err.message, '');
      }
    );
  }

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="reverify"]');
    if (btn) reverify(btn);
  });

  /* ---------- Export ---------- */

  $('export-btn').addEventListener('click', function () {
    if (el.from.value && el.to.value && el.from.value > el.to.value) {
      showAlert('warning', 'The "From" date is after the "To" date.', 'Change one of them.');
      return;
    }
    var btn = $('export-btn');
    clearAlert();
    btn.disabled = true;
    UI.showLoader('Preparing your download...');
    Api.download('/admin/export/payments', {
      q: el.q.value.trim(),
      type: el.type.value,
      status: el.status.value,
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      from: el.from.value,
      to: el.to.value
    }).then(
      function () { UI.hideLoader(); btn.disabled = false; UI.toast('Export downloaded', 'success'); },
      function (err) {
        UI.hideLoader();
        btn.disabled = false;
        showAlert(err.status === 400 || err.status === 404 ? 'warning' : 'error', err.message, '');
      }
    );
  });

  /* ---------- Start ---------- */
  Auth.init({ page: 'payments' }).then(function (admin) {
    isSuper = admin.role === 'superadmin';
        el.stats.classList.remove('hidden');
    if (!isSuper) {
      $('page-sub').textContent = 'Every payment made on the site.';
    }

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