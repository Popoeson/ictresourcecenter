(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }

  var el = {
    name: $('f-name'), phone: $('f-phone'), email: $('f-email'),
    eName: $('e-name'), ePhone: $('e-phone'), eEmail: $('e-email'),
    inst: $('f-inst'), deptField: $('dept-field'), dept: $('f-dept'),
    levelField: $('level-field'), level: $('f-level'),
    feeCard: $('fee-card'), feeAmount: $('fee-amount'), feeFor: $('fee-for'),
    deliveryField: $('delivery-field'), choicePdf: $('choice-pdf'), choicePickup: $('choice-pickup'),
    note: $('delivery-note'), pay: $('pay-btn'), alert: $('page-alert')
  };

  var quote = null;
  var quoteSeq = 0;

  function showAlert(type, title, text) { el.alert.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { el.alert.innerHTML = ''; }
  function show(node) { node.classList.remove('hidden'); }
  function hide(node) { node.classList.add('hidden'); }

  function setErr(input, errEl, message) {
    errEl.textContent = message || '';
    errEl.classList.toggle('hidden', !message);
    input.classList.toggle('invalid', !!message);
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  /* ---------- Resetting later steps ---------- */

  function radios() { return document.querySelectorAll('input[name="delivery"]'); }

  function resetQuote() {
    quote = null;
    quoteSeq += 1;
    hide(el.feeCard);
    hide(el.deliveryField);
    hide(el.note);
    hide(el.pay);
    Array.prototype.forEach.call(radios(), function (r) { r.checked = false; });
  }

  function resetLevel() {
    resetQuote();
    UI.fillSelect(el.level, [], { placeholder: 'Select level' });
    hide(el.levelField);
  }

  function resetDept() {
    resetLevel();
    UI.fillSelect(el.dept, [], { placeholder: 'Select department' });
    hide(el.deptField);
  }

  /* ---------- Institution, department, level ---------- */

  el.inst.addEventListener('change', function () {
    clearAlert();
    resetDept();
    if (!el.inst.value) return;
    UI.showLoader('Loading...');
    Api.get('/lookups/departments', { institution: el.inst.value }).then(
      function (list) {
        UI.hideLoader();
        UI.fillSelect(el.dept, toOptions(list), { placeholder: 'Select department' });
        show(el.deptField);
      },
      function (err) {
        UI.hideLoader();
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  });

  el.dept.addEventListener('change', function () {
    clearAlert();
    resetLevel();
    if (!el.dept.value) return;
    UI.showLoader('Loading...');
    Api.get('/lookups/levels', { department: el.dept.value }).then(
      function (list) {
        UI.hideLoader();
        UI.fillSelect(el.level, toOptions(list), { placeholder: 'Select level' });
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
    resetQuote();
    if (el.level.value) loadQuote();
  });

  /* ---------- Price and delivery ---------- */

  function currentDelivery() {
    if (!quote || quote.blocked) return '';
    if (quote.options.length === 1) return quote.options[0];
    var checked = document.querySelector('input[name="delivery"]:checked');
    return checked ? checked.value : '';
  }

  function updatePay() {
    el.pay.textContent = 'Pay ' + UI.naira(quote.amount);
    el.pay.disabled = !currentDelivery();
    show(el.pay);
  }

  function renderQuote(q) {
    quote = q;

    if (q.blocked) {
      showAlert('warning', q.message, '');
      return;
    }

    el.feeAmount.textContent = UI.naira(q.amount);
    el.feeFor.textContent = [q.institution, q.department, q.level].join(' \u00B7 ');
    show(el.feeCard);

    var hasPdf = q.options.indexOf('pdf') !== -1;
    var hasPickup = q.options.indexOf('pickup') !== -1;
    el.choicePdf.classList.toggle('hidden', !hasPdf);
    el.choicePickup.classList.toggle('hidden', !hasPickup);

    var note = q.message || '';
    if (q.options.length > 1) {
      show(el.deliveryField);
    } else {
      hide(el.deliveryField);
      if (!note) {
        note = hasPdf
          ? 'You will download the PDF after paying.'
          : 'You will get a pickup code after paying. Show it when you collect your copy.';
      }
    }
    el.note.textContent = note;
    el.note.classList.toggle('hidden', !note);

    updatePay();
  }

  function loadQuote() {
    var id = ++quoteSeq;
    UI.showLoader('Loading...');
    Api.get('/handouts/quote', {
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value
    }).then(
      function (q) {
        if (id !== quoteSeq) return;
        UI.hideLoader();
        renderQuote(q);
      },
      function (err) {
        if (id !== quoteSeq) return;
        UI.hideLoader();
        showAlert(err.code === 'PRICE_NOT_SET' ? 'warning' : 'error', err.message,
          err.code === 'PRICE_NOT_SET' ? '' : 'Please try again.');
      }
    );
  }

  Array.prototype.forEach.call(radios(), function (r) {
    r.addEventListener('change', function () { if (quote) updatePay(); });
  });

  /* ---------- Buyer details ---------- */

  function validateDetails() {
    var first = null;

    var name = el.name.value.replace(/\s+/g, ' ').trim();
    if (name.length < 3) {
      setErr(el.name, el.eName, 'Enter your full name.');
      first = first || el.name;
    } else {
      setErr(el.name, el.eName, '');
    }

    var digits = el.phone.value.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) {
      setErr(el.phone, el.ePhone, 'Enter a valid phone number, for example 08012345678.');
      first = first || el.phone;
    } else {
      setErr(el.phone, el.ePhone, '');
    }

    var email = el.email.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErr(el.email, el.eEmail, 'Enter a valid email address.');
      first = first || el.email;
    } else {
      setErr(el.email, el.eEmail, '');
    }

    if (first) { first.focus(); return null; }
    return { name: name, phone: el.phone.value.trim(), email: email };
  }

  el.name.addEventListener('input', function () { setErr(el.name, el.eName, ''); });
  el.phone.addEventListener('input', function () { setErr(el.phone, el.ePhone, ''); });
  el.email.addEventListener('input', function () { setErr(el.email, el.eEmail, ''); });

  /* ---------- Pay ---------- */

  el.pay.addEventListener('click', function () {
    clearAlert();
    var delivery = currentDelivery();
    if (!quote || !delivery) return;
    var details = validateDetails();
    if (!details) return;

    el.pay.disabled = true;
    UI.showLoader('Taking you to Paystack...');
    Api.post('/handouts/initialize', {
      name: details.name,
      phone: details.phone,
      email: details.email,
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      delivery: delivery
    }).then(
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
  UI.fillSelect(el.inst, [], { placeholder: 'Select institution' });
  UI.showLoader('Loading...');
  Api.get('/lookups/institutions').then(
    function (list) {
      UI.hideLoader();
      UI.fillSelect(el.inst, toOptions(list), { placeholder: 'Select institution' });
    },
    function (err) {
      UI.hideLoader();
      showAlert('error', err.message, 'Reload the page to try again.');
    }
  );
})();