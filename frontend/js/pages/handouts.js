(function () {
  'use strict';

  var PAGE_SIZE = 25;

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function dash() { return '<span class="muted">\u2014</span>'; }

  var items = {};
  var state = { page: 1, totalPages: 1, total: 0 };
  var requestId = 0;
  var searchTimer = null;

  var alertEl = $('page-alert');
  var el = {
    q: $('f-q'), delivery: $('f-delivery'), buyer: $('f-buyer'), pickup: $('f-pickup'),
    inst: $('f-inst'), dept: $('f-dept'), level: $('f-level'),
    from: $('f-from'), to: $('f-to'), clear: $('f-clear'),
    pending: $('orders-pending'), count: $('orders-count'),
    empty: $('orders-empty'), wrap: $('orders-wrap'), body: $('orders-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info')
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
    return !!(el.q.value.trim() || el.delivery.value || el.buyer.value || el.pickup.value ||
      el.inst.value || el.dept.value || el.level.value || el.from.value || el.to.value);
  }

  function deliveryCell(o) {
    if (o.delivery === 'pdf') return UI.badge('PDF', 'outline');
    return UI.badge('Pickup', 'outline') +
      (o.pickupCode ? '<div><strong>' + UI.esc(o.pickupCode) + '</strong></div>' : '');
  }

  function buyerTypeCell(o) {
    if (!o.isStudent) return UI.badge('Non-student', 'grey');
    return UI.badge('Student', 'tan') +
      (o.matchedBy ? '<div class="hint">Matched by ' + UI.esc(o.matchedBy) + '</div>' : '');
  }

  function pickupCell(o) {
    if (o.delivery !== 'pickup') return dash();
    if (o.pickupStatus === 'collected') {
      var who = o.collectedBy ? ' by ' + o.collectedBy : '';
      return UI.badge('Collected', 'green') +
        '<div class="hint">' + UI.esc(UI.fmtDate(o.collectedAt) + who) + '</div>';
    }
    return UI.badge('Waiting', 'amber');
  }

  function actionCell(o) {
    if (o.delivery === 'pickup' && o.pickupStatus === 'pending') {
      return '<button type="button" class="btn btn-secondary btn-small" data-act="collect" data-id="' +
        UI.esc(o.id) + '">Mark collected</button>';
    }
    return dash();
  }

  function rowHtml(o) {
    var klass = [o.institution, o.department, o.level].filter(Boolean).join(' \u00B7 ');
    var contact = [o.buyerEmail, o.buyerPhone].filter(Boolean).join(' \u00B7 ');
    return '<tr>' +
      '<td data-label="Date">' + UI.esc(UI.fmtDate(o.createdAt)) + '</td>' +
      '<td data-label="Buyer"><span class="student-name">' + UI.esc(o.buyerName || '\u2014') + '</span>' +
        (contact ? '<div class="hint">' + UI.esc(contact) + '</div>' : '') + '</td>' +
      '<td data-label="Class">' + UI.esc(klass || '\u2014') + '</td>' +
      '<td data-label="Delivery">' + deliveryCell(o) + '</td>' +
      '<td data-label="Buyer type">' + buyerTypeCell(o) + '</td>' +
      '<td data-label="Pickup">' + pickupCell(o) + '</td>' +
      '<td class="cell-actions" data-label="Actions">' + actionCell(o) + '</td>' +
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
    data.items.forEach(function (o) { items[o.id] = o; });
    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;

    var waiting = data.summary ? Number(data.summary.pendingPickups) || 0 : 0;
    el.pending.textContent = waiting
      ? waiting + ' hard cop' + (waiting === 1 ? 'y is' : 'ies are') + ' waiting to be collected.'
      : '';

    if (!data.items.length) {
      el.count.textContent = '';
      showEmpty(filtersActive() ? 'No orders match your filters.' : 'No handout orders yet.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' order' + (state.total === 1 ? '' : 's');

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
    el.count.textContent = 'Loading orders...';
    Api.get('/admin/handout-orders', {
      page: page || 1,
      limit: PAGE_SIZE,
      q: el.q.value.trim(),
      delivery: el.delivery.value,
      buyer: el.buyer.value,
      pickup: el.pickup.value,
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
  [el.delivery, el.buyer, el.pickup, el.level, el.from, el.to].forEach(function (c) {
    c.addEventListener('change', function () { loadList(1); });
  });

  el.clear.addEventListener('click', function () {
    el.q.value = '';
    el.delivery.value = '';
    el.buyer.value = '';
    el.pickup.value = '';
    el.inst.value = '';
    el.from.value = '';
    el.to.value = '';
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadList(1);
  });

  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Mark collected ---------- */

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="collect"]');
    if (!btn) return;
    var o = items[btn.getAttribute('data-id')];
    if (!o) return;

    UI.confirm({
      title: 'Mark as collected?',
      message: o.buyerName + ' is collecting the hard copy with code ' + o.pickupCode + '. This cannot be undone.',
      confirmText: 'Mark collected'
    }).then(function (yes) {
      if (!yes) return;
      UI.showLoader('Saving...');
      Api.post('/admin/handout-orders/' + encodeURIComponent(o.id) + '/collect').then(
        function () {
          UI.hideLoader();
          UI.toast('Marked as collected', 'success');
          loadList(state.page);
        },
        function (err) {
          UI.hideLoader();
          showAlert('error', err.message, '');
          if (err.status === 409) loadList(state.page);
        }
      );
    });
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'handouts' }).then(function () {
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