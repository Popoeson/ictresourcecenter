(function () {
  'use strict';

  var TYPE = 'departmental_fee';

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }

  var el = {
    inst: $('f-inst'), level: $('f-level'), q: $('f-q'),
    levelField: $('level-field'), nameField: $('name-field'),
    searchBlock: $('search-block'), status: $('search-status'), results: $('name-results'),
    chosen: $('chosen'), chosenName: $('chosen-name'), chosenDept: $('chosen-dept'), change: $('chosen-change'),
    feeCard: $('fee-card'), feeAmount: $('fee-amount'), feeFor: $('fee-for'),
    pay: $('pay-btn'), paidCard: $('paid-card'), receipt: $('receipt-link'), alert: $('page-alert')
  };

  var found = {};
  var selected = null;
  var searchId = 0;
  var timer = null;

  function showAlert(type, title, text) { el.alert.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { el.alert.innerHTML = ''; }
  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }

  /* ---------- Resetting later steps when an earlier choice changes ---------- */

  function resetPayment() {
    hide(el.feeCard);
    hide(el.pay);
    hide(el.paidCard);
  }

  function resetName() {
    selected = null;
    searchId += 1;
    clearTimeout(timer);
    found = {};
    el.q.value = '';
    el.status.textContent = '';
    el.results.innerHTML = '';
    hide(el.chosen);
    show(el.searchBlock);
    resetPayment();
  }

  /* ---------- Institution and level ---------- */

  el.inst.addEventListener('change', function () {
    clearAlert();
    resetName();
    hide(el.nameField);
    UI.fillSelect(el.level, [], { placeholder: 'Select level' });
    if (!el.inst.value) { hide(el.levelField); return; }

    UI.showLoader('Loading...');
    Api.get('/lookups/levels', { institution: el.inst.value }).then(
      function (levels) {
        UI.hideLoader();
        UI.fillSelect(el.level, levels, { value: 'key', label: 'name', placeholder: 'Select level' });
        show(el.levelField);
      },
      function (err) {
        UI.hideLoader();
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  });

  el.level.addEventListener('change', function () {
    clearAlert();
    resetName();
    if (!el.level.value) { hide(el.nameField); return; }
    show(el.nameField);
    el.q.focus();
  });

  /* ---------- Name search ---------- */

  function renderResults(list) {
    found = {};
    if (!list.length) {
      el.results.innerHTML = UI.alertHtml('info', 'We could not find your name.',
        'Please contact your course lecturer for registration.');
      return;
    }
    list.forEach(function (s) { found[s.id] = s; });
    el.results.innerHTML = '<ul class="name-results">' + list.map(function (s) {
      return '<li><button type="button" class="name-result" data-id="' + UI.esc(s.id) + '">' +
        '<span class="name-result-name">' + UI.esc(s.name) + '</span>' +
        '<span class="name-result-dept">' + UI.esc(s.department) + '</span></button></li>';
    }).join('') + '</ul>';
  }

  function search() {
    var text = el.q.value.trim();
    var id = ++searchId;
    el.results.innerHTML = '';
    if (text.length < 3) {
      el.status.textContent = text.length ? 'Type at least 3 characters.' : '';
      return;
    }
    el.status.textContent = 'Searching...';
    Api.get('/students/search', { institution: el.inst.value, levelKey: el.level.value, q: text }).then(
      function (list) {
        if (id !== searchId) return;
        el.status.textContent = '';
        renderResults(list);
      },
      function (err) {
        if (id !== searchId) return;
        el.status.textContent = '';
        el.results.innerHTML = UI.alertHtml('error', err.message, 'Please try again.');
      }
    );
  }

  el.q.addEventListener('input', function () {
    clearAlert();
    clearTimeout(timer);
    timer = setTimeout(search, 300);
  });

  /* ---------- Choosing a student and showing the fee ---------- */

  function choose(student) {
    selected = student;
    searchId += 1;
    el.results.innerHTML = '';
    el.status.textContent = '';
    hide(el.searchBlock);
    el.chosenName.textContent = student.name;
    el.chosenDept.textContent = student.department;
    show(el.chosen);
    loadQuote();
  }

  function loadQuote() {
    resetPayment();
    clearAlert();
    UI.showLoader('Loading...');
    Api.get('/pricing/quote', { type: TYPE, studentId: selected.id }).then(
      function (q) {
        UI.hideLoader();
        if (q.alreadyPaid) {
          el.receipt.href = '/api/receipts/' + encodeURIComponent(q.reference);
          show(el.paidCard);
          return;
        }
        el.feeAmount.textContent = UI.naira(q.amount);
        el.feeFor.textContent = 'For ' + selected.name;
        el.pay.textContent = 'Pay ' + UI.naira(q.amount);
        el.pay.disabled = false;
        show(el.feeCard);
        show(el.pay);
      },
      function (err) {
        UI.hideLoader();
        if (err.code === 'NOT_ELIGIBLE') {
          showAlert('warning', err.message, 'Change your name if you picked the wrong one, or contact your course lecturer.');
        } else if (err.code === 'PRICE_NOT_SET') {
          showAlert('warning', err.message, '');
        } else {
          showAlert('error', err.message, 'Please try again.');
        }
      }
    );
  }

  el.results.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-id]');
    if (!btn) return;
    var s = found[btn.getAttribute('data-id')];
    if (s) choose(s);
  });

  el.change.addEventListener('click', function () {
    clearAlert();
    resetName();
    el.q.focus();
  });

  /* ---------- Pay ---------- */

  el.pay.addEventListener('click', function () {
    if (!selected) return;
    clearAlert();
    el.pay.disabled = true;
    UI.showLoader('Taking you to Paystack...');
    Api.post('/payments/initialize', { type: TYPE, studentId: selected.id }).then(
      function (r) { window.location.href = r.authorizationUrl; },
      function (err) {
        UI.hideLoader();
        el.pay.disabled = false;
        showAlert('error', err.message, 'Nothing was charged. Please try again.');
      }
    );
  });

  // Coming back with the browser Back button from Paystack: start fresh
  window.addEventListener('pageshow', function (e) { if (e.persisted) window.location.reload(); });

  /* ---------- Start ---------- */

  $('year').textContent = new Date().getFullYear();
  UI.showLoader('Loading...');
  Api.get('/lookups/institutions').then(
    function (list) {
      UI.hideLoader();
      UI.fillSelect(el.inst, list.map(function (i) { return { id: idOf(i), name: i.name }; }), { placeholder: 'Select institution' });
    },
    function (err) {
      UI.hideLoader();
      showAlert('error', err.message, 'Reload the page to try again.');
    }
  );
})();