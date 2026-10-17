(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var STATUS = {
    active: ['Active', 'green'],
    in_progress: ['In use', 'amber'],
    used: ['Used', 'grey'],
    expired: ['Expired', 'red'],
    revoked: ['Replaced', 'grey']
  };
  var SOURCE = {
    payment: ['Payment', 'tan'],
    reissue: ['Reissued', 'outline'],
    manual: ['Manual', 'outline']
  };

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function filesText(n) { return n + (n === 1 ? ' file' : ' files'); }
  function deptText(d) { return d && typeof d === 'object' ? (d.name || '') : (d || ''); }

  var state = { page: 1, totalPages: 1, total: 0, items: [] };
  var requestId = 0;
  var filterTimer = null;
  var searchTimer = null;
  var searchSeq = 0;
  var chosen = null;
  var found = [];
  var pending = null;
  var lastCode = '';

  var el = {
    alert: $('page-alert'), newBtn: $('new-token-btn'),
    q: $('f-q'), status: $('f-status'), source: $('f-source'),
    from: $('f-from'), to: $('f-to'), clear: $('f-clear'),
    count: $('tokens-count'), empty: $('tokens-empty'), wrap: $('tokens-wrap'), body: $('tokens-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info'),
    resultCard: $('result-card'), rTitle: $('result-title'), rFor: $('result-for'), rCode: $('result-code'),
    rMeta: $('result-meta'), rNote: $('result-note'), rCopy: $('result-copy'), rDone: $('result-done'),
    reissueCard: $('reissue-card'), reTitle: $('reissue-title'), reText: $('reissue-text'),
    rAlert: $('r-alert'), reYes: $('reissue-yes'), reNo: $('reissue-no'),
    createCard: $('create-card'), createTitle: $('create-title'), cAlert: $('c-alert'),
    cInst: $('c-inst'), cLevel: $('c-level'), cQ: $('c-q'), cHint: $('c-hint'),
    cSearchBlock: $('c-search-block'), cResults: $('c-results'),
    cChosen: $('c-chosen'), cChosenName: $('c-chosen-name'), cChosenDept: $('c-chosen-dept'),
    cChange: $('c-change'), cFiles: $('c-files'), cCreate: $('c-create'), cCancel: $('c-cancel')
  };

  var panels = { result: el.resultCard, reissue: el.reissueCard, create: el.createCard };

  function showAlert(type, title, text) { el.alert.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { el.alert.innerHTML = ''; }

  // Only one panel is open at a time. openPanel(null) closes them all.
  function openPanel(name, focusEl) {
    Object.keys(panels).forEach(function (k) { panels[k].classList.toggle('hidden', k !== name); });
    if (name) {
      panels[name].scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (focusEl) focusEl.focus({ preventScroll: true });
    }
  }

  /* ---------- List ---------- */

  function filtersActive() {
    return !!(el.q.value.trim() || el.status.value || el.source.value || el.from.value || el.to.value);
  }

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function rowHtml(t) {
    var klass = [t.institution, t.department, t.level].filter(Boolean).join(' \u00B7 ');
    var st = STATUS[t.status] || [t.status, 'grey'];
    var src = SOURCE[t.source] || [t.source, 'grey'];

    var statusHint = '';
    if (t.status === 'active') statusHint = 'Expires ' + UI.fmtDate(t.expiresAt);
    else if (t.status === 'used' && t.usedAt) statusHint = 'Used ' + UI.fmtDate(t.usedAt);
    else if (t.status === 'expired') statusHint = 'Ended ' + UI.fmtDate(t.expiresAt);

    var srcHint = '';
    if (t.source === 'payment' && t.paymentReference) srcHint = t.paymentReference;
    else if (t.createdByName) srcHint = 'by ' + t.createdByName;

    var files = t.status === 'used' ? t.filesUploaded + ' of ' + t.filesAllowed + ' uploaded' : String(t.filesAllowed);

    var action = t.canReissue
      ? '<button type="button" class="btn btn-secondary btn-small" data-act="reissue" data-id="' + UI.esc(t.id) + '">Reissue</button>'
      : '<span class="muted">\u2014</span>';

    return '<tr>' +
      '<td data-label="Created">' + UI.esc(UI.fmtDate(t.createdAt)) + '</td>' +
      '<td data-label="Student"><span class="student-name">' + UI.esc(t.studentName || '\u2014') + '</span>' +
        (klass ? '<div class="hint">' + UI.esc(klass) + '</div>' : '') + '</td>' +
      '<td data-label="Token"><strong>' + UI.esc(t.code) + '</strong></td>' +
      '<td data-label="Made by">' + UI.badge(src[0], src[1]) +
        (srcHint ? '<div class="hint">' + UI.esc(srcHint) + '</div>' : '') + '</td>' +
      '<td data-label="Files">' + UI.esc(files) + '</td>' +
      '<td data-label="Status">' + UI.badge(st[0], st[1]) +
        (statusHint ? '<div class="hint">' + UI.esc(statusHint) + '</div>' : '') + '</td>' +
      '<td class="cell-actions" data-label="Actions">' + action + '</td>' +
      '</tr>';
  }

  function render(data) {
    var page = Number(data.page) || 1;
    if (!data.items.length && page > 1) { loadList(page - 1); return; }

    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;
    state.items = data.items;

    if (!data.items.length) {
      el.count.textContent = '';
      showEmpty(filtersActive() ? 'No tokens match your filters.' : 'No tokens yet.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' token' + (state.total === 1 ? '' : 's');

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
    el.count.textContent = 'Loading tokens...';
    Api.get('/admin/tokens', {
      page: page || 1,
      limit: PAGE_SIZE,
      q: el.q.value.trim(),
      status: el.status.value,
      source: el.source.value,
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

  el.q.addEventListener('input', function () {
    clearTimeout(filterTimer);
    filterTimer = setTimeout(function () { loadList(1); }, 300);
  });
  [el.status, el.source, el.from, el.to].forEach(function (c) {
    c.addEventListener('change', function () { loadList(1); });
  });
  el.clear.addEventListener('click', function () {
    el.q.value = '';
    el.status.value = '';
    el.source.value = '';
    el.from.value = '';
    el.to.value = '';
    loadList(1);
  });
  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Result panel ---------- */

  function showResult(row, title, previousCode) {
    lastCode = row.code;
    el.rTitle.textContent = title;
    el.rFor.textContent = 'Give this token to ' + (row.studentName || 'the student');
    el.rCode.textContent = row.code;
    el.rMeta.textContent = filesText(row.filesAllowed) + ' \u00B7 Valid until ' + UI.fmtDate(row.expiresAt);
    el.rNote.textContent = previousCode
      ? 'The old token ' + previousCode + ' no longer works. The time window starts now.'
      : 'The student opens the site and taps "Continue with a token". The time window starts now.';
    openPanel('result', el.rTitle);
  }

  function copyFallback() { UI.toast('Press and hold the token to copy it.', 'info'); }

  el.rCopy.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(lastCode).then(function () { UI.toast('Token copied.', 'success'); }, copyFallback);
    } else {
      copyFallback();
    }
  });
  el.rDone.addEventListener('click', function () { openPanel(null); });

  /* ---------- Reissue ---------- */

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="reissue"]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var item = state.items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    pending = item;
    el.reTitle.textContent = 'Reissue ' + item.code + '?';
    el.reText.textContent = 'The old token stops working. ' + (item.studentName || 'The student') +
      ' gets a new token for ' + filesText(item.filesAllowed) + ' with a fresh time window that starts now. ' +
      'You will need to give the new token to the student.';
    el.rAlert.innerHTML = '';
    el.reYes.disabled = false;
    openPanel('reissue', el.reTitle);
  });

  el.reNo.addEventListener('click', function () { pending = null; openPanel(null); });

  el.reYes.addEventListener('click', function () {
    if (!pending) return;
    el.reYes.disabled = true;
    el.rAlert.innerHTML = '';
    UI.showLoader('Reissuing the token...');
    Api.post('/admin/tokens/' + encodeURIComponent(pending.id) + '/reissue').then(
      function (row) {
        UI.hideLoader();
        pending = null;
        showResult(row, 'Token reissued', row.previousCode);
        loadList(state.page);
      },
      function (err) {
        UI.hideLoader();
        el.reYes.disabled = false;
        el.rAlert.innerHTML = UI.alertHtml('error', err.message, '');
        if (err.status === 409) loadList(state.page);
      }
    );
  });

  /* ---------- Create a token by hand ---------- */

  function updateCreateButton() { el.cCreate.disabled = !chosen; }

  function resetStudent() {
    chosen = null;
    found = [];
    searchSeq++;
    el.cResults.innerHTML = '';
    el.cResults.classList.add('hidden');
    el.cChosen.classList.add('hidden');
    el.cSearchBlock.classList.remove('hidden');
    el.cQ.value = '';
    el.cHint.textContent = 'Type at least 3 letters of the name.';
    updateCreateButton();
  }

  function resetLevel() {
    UI.fillSelect(el.cLevel, [], { placeholder: 'Choose a level' });
    el.cLevel.disabled = true;
    el.cQ.disabled = true;
  }

  function resetCreate() {
    el.cAlert.innerHTML = '';
    el.cInst.value = '';
    el.cFiles.value = '1';
    resetLevel();
    resetStudent();
  }

  el.cInst.addEventListener('change', function () {
    resetStudent();
    resetLevel();
    if (!el.cInst.value) return;
    Api.get('/lookups/levels', { institution: el.cInst.value }).then(function (list) {
      UI.fillSelect(el.cLevel, list, { value: 'key', label: 'name', placeholder: 'Choose a level' });
      el.cLevel.disabled = false;
    }, function (err) { el.cAlert.innerHTML = UI.alertHtml('error', err.message, ''); });
  });

  el.cLevel.addEventListener('change', function () {
    resetStudent();
    el.cQ.disabled = !el.cLevel.value;
    if (el.cLevel.value) el.cQ.focus();
  });

  el.cQ.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
  });

  function runSearch() {
    var text = el.cQ.value.trim();
    if (text.length < 3) {
      searchSeq++;
      found = [];
      el.cResults.classList.add('hidden');
      el.cHint.textContent = 'Type at least 3 letters of the name.';
      return;
    }
    var seq = ++searchSeq;
    el.cHint.textContent = 'Searching...';
    Api.get('/students/search', {
      institution: el.cInst.value,
      levelKey: el.cLevel.value,
      q: text
    }).then(function (list) {
      if (seq !== searchSeq) return;
      found = Array.isArray(list) ? list : ((list && list.items) || []);
      renderResults();
    }, function (err) {
      if (seq !== searchSeq) return;
      el.cHint.textContent = err.message;
    });
  }

  function renderResults() {
    if (!found.length) {
      el.cResults.classList.add('hidden');
      el.cHint.textContent = 'No student found with that name.';
      return;
    }
    el.cHint.textContent = 'Choose the student.';
    el.cResults.innerHTML = found.map(function (s, i) {
      return '<li><button type="button" class="name-result" data-idx="' + i + '">' +
        '<span class="name-result-name">' + UI.esc(s.name || '') + '</span>' +
        '<span class="name-result-dept">' + UI.esc(deptText(s.department)) + '</span></button></li>';
    }).join('');
    el.cResults.classList.remove('hidden');
  }

  el.cResults.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-idx]');
    if (!btn) return;
    var s = found[Number(btn.getAttribute('data-idx'))];
    if (!s) return;
    chosen = { id: idOf(s), name: s.name || '', dept: deptText(s.department) };
    el.cChosenName.textContent = chosen.name;
    el.cChosenDept.textContent = chosen.dept;
    el.cChosen.classList.remove('hidden');
    el.cSearchBlock.classList.add('hidden');
    el.cResults.classList.add('hidden');
    updateCreateButton();
    el.cFiles.focus();
  });

  el.cChange.addEventListener('click', function () {
    resetStudent();
    el.cQ.focus();
  });

  el.newBtn.addEventListener('click', function () {
    resetCreate();
    openPanel('create', el.createTitle);
  });
  el.cCancel.addEventListener('click', function () { openPanel(null); });

  el.cCreate.addEventListener('click', function () {
    if (!chosen) return;
    el.cCreate.disabled = true;
    el.cAlert.innerHTML = '';
    UI.showLoader('Creating the token...');
    Api.post('/admin/tokens/manual', { studentId: chosen.id, files: Number(el.cFiles.value) }).then(
      function (row) {
        UI.hideLoader();
        resetCreate();
        showResult(row, 'Token created', null);
        loadList(1);
      },
      function (err) {
        UI.hideLoader();
        updateCreateButton();
        el.cAlert.innerHTML = UI.alertHtml('error', err.message, '');
      }
    );
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'tokens', roles: ['superadmin'] }).then(function () {
    UI.fillSelect(el.cInst, [], { placeholder: 'Choose an institution' });
    resetLevel();
    Api.get('/lookups/institutions').then(function (list) {
      UI.fillSelect(el.cInst, toOptions(list), { placeholder: 'Choose an institution' });
    }, function (err) {
      showAlert('error', err.message, 'The create form may not work. Reload the page to try again.');
    });
    loadList(1);
  });
})();