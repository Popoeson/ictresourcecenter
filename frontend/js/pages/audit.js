(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var IGNORED_KEYS = ['_id', '__v', 'createdAt', 'updatedAt', 'passwordHash'];

  // Plain-language names for the actions the site records. Anything else shows its raw name.
  var LABELS = {
    'student.create': 'Added a student',
    'student.update': 'Edited a student',
    'student.delete': 'Deleted a student',
    'price.update': 'Changed a price',
    'price.delete': 'Cleared a price',
    'token.reissue': 'Reissued a token',
    'token.manual_create': 'Created a token by hand',
    'admin.create': 'Added an admin',
    'admin.update': 'Edited an admin',
    'admin.deactivate': 'Deactivated an admin',
    'admin.activate': 'Reactivated an admin',
    'admin.reset_password': 'Reset an admin password',
    'payment.reverify': 'Re-verified a payment',
    'handout.upload': 'Uploaded a handout PDF',
    'handout.mode_update': 'Changed the handout delivery mode',
    'handout.collect': 'Marked a handout as collected',
    'submission.delete': 'Deleted a submission',
    'import.run': 'Imported students'
  };

  function $(id) { return document.getElementById(id); }
  function labelOf(action) { return LABELS[action] || action; }

  // 18 Oct 2026, 14:05 in Nigerian time
  function fmtWhen(d) {
    if (!d) return '\u2014';
    return new Date(d).toLocaleString('en-GB', {
      timeZone: 'Africa/Lagos', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function niceType(t) {
    if (!t) return '';
    var s = t.replace(/([A-Z])/g, ' $1').toLowerCase();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  var items = {};
  var state = { page: 1, totalPages: 1, total: 0 };
  var requestId = 0;

  var alertEl = $('page-alert');
  var el = {
    actor: $('f-actor'), action: $('f-action'), from: $('f-from'), to: $('f-to'), clear: $('f-clear'),
    count: $('audit-count'), empty: $('audit-empty'), wrap: $('audit-wrap'), body: $('audit-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info')
  };

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  /* ---------- Filters ---------- */

  function loadFilters() {
    Api.get('/admin/audit/filters').then(
      function (f) {
        UI.fillSelect(el.actor, f.actors.map(function (a) {
          return { id: a.id, name: a.name + (a.role === 'superadmin' ? ' (Super Admin)' : ' (Admin)') };
        }), { placeholder: 'Everyone' });
        UI.fillSelect(el.action, f.actions.map(function (a) { return { id: a, name: labelOf(a) }; }), { placeholder: 'All actions' });
      },
      function (err) { showAlert('error', err.message, 'The filters may be missing. Reload the page to try again.'); }
    );
  }

  function filtersActive() {
    return !!(el.actor.value || el.action.value || el.from.value || el.to.value);
  }

  [el.actor, el.action, el.from, el.to].forEach(function (c) {
    c.addEventListener('change', function () { loadList(1); });
  });

  el.clear.addEventListener('click', function () {
    el.actor.value = '';
    el.action.value = '';
    el.from.value = '';
    el.to.value = '';
    loadList(1);
  });

  /* ---------- List ---------- */

  function rowHtml(r) {
    var role = r.actorRole === 'superadmin' ? 'Super Admin' : r.actorRole === 'admin' ? 'Admin' : '';
    var about = niceType(r.entityType);
    var shortId = r.entityId ? '\u2026' + r.entityId.slice(-6) : '';
    return '<tr>' +
      '<td data-label="When">' + UI.esc(fmtWhen(r.createdAt)) + '</td>' +
      '<td data-label="Who"><span class="student-name">' + UI.esc(r.actorName) + '</span>' +
        (role ? '<div class="hint">' + UI.esc(role) + '</div>' : '') + '</td>' +
      '<td data-label="What"><span class="student-name">' + UI.esc(labelOf(r.action)) + '</span>' +
        '<div class="hint">' + UI.esc(r.action) + '</div></td>' +
      '<td data-label="About">' + (about ? UI.esc(about) : '<span class="muted">\u2014</span>') +
        (shortId ? '<div class="hint">' + UI.esc(shortId) + '</div>' : '') + '</td>' +
      '<td class="cell-actions" data-label="Details">' +
        '<button type="button" class="btn btn-secondary btn-small" data-act="details" data-id="' + UI.esc(r.id) + '">Details</button></td>' +
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
    data.items.forEach(function (r) { items[r.id] = r; });
    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;

    if (!data.items.length) {
      el.count.textContent = '';
      showEmpty(filtersActive() ? 'Nothing matches your filters.' : 'No activity recorded yet.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' entr' + (state.total === 1 ? 'y' : 'ies');

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
    el.count.textContent = 'Loading...';
    Api.get('/admin/audit', {
      page: page || 1, limit: PAGE_SIZE,
      actor: el.actor.value, action: el.action.value, from: el.from.value, to: el.to.value
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

  /* ---------- Details ---------- */

  function valueText(v) {
    if (v === undefined || v === null || v === '') return 'empty';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return s.length > 120 ? s.slice(0, 117) + '...' : s;
  }

  function isObject(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

  // For an edit: only the fields that changed, as "old \u2192 new"
  function changesHtml(r) {
    if (!isObject(r.before) || !isObject(r.after)) return '';
    var keys = {};
    Object.keys(r.before).concat(Object.keys(r.after)).forEach(function (k) { keys[k] = true; });
    var lines = Object.keys(keys).filter(function (k) {
      return IGNORED_KEYS.indexOf(k) === -1 && JSON.stringify(r.before[k]) !== JSON.stringify(r.after[k]);
    }).map(function (k) {
      return '<li><strong>' + UI.esc(k) + '</strong>: ' + UI.esc(valueText(r.before[k])) +
        ' \u2192 ' + UI.esc(valueText(r.after[k])) + '</li>';
    });
    if (!lines.length) return '';
    return '<h3>What changed</h3><ul class="audit-changes">' + lines.join('') + '</ul>';
  }

  function jsonBlock(title, value) {
    if (value === null || value === undefined) return '';
    return '<p><strong>' + UI.esc(title) + '</strong></p><pre class="audit-json">' +
      UI.esc(JSON.stringify(value, null, 2)) + '</pre>';
  }

  function openDetails(r) {
    var full = jsonBlock('Before', r.before) + jsonBlock('After', r.after);
    var body = '<p class="hint">' + UI.esc(labelOf(r.action)) + ' by ' + UI.esc(r.actorName) +
      ' on ' + UI.esc(fmtWhen(r.createdAt)) + (r.ip ? ' from ' + UI.esc(r.ip) : '') + '.</p>' +
      changesHtml(r) +
      (full ? '<details><summary>Full record</summary>' + full + '</details>' : '<p class="hint">No more details were recorded.</p>');

    UI.modal({
      title: 'Activity details',
      bodyHtml: body,
      actions: [{ label: 'Close', kind: 'secondary', onClick: function (m) { m.close(); } }]
    });
  }

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="details"]');
    if (!btn) return;
    var r = items[btn.getAttribute('data-id')];
    if (r) openDetails(r);
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'audit', roles: ['superadmin'] }).then(function () {
    UI.fillSelect(el.actor, [], { placeholder: 'Everyone' });
    UI.fillSelect(el.action, [], { placeholder: 'All actions' });
    loadFilters();
    loadList(1);
  });
})();