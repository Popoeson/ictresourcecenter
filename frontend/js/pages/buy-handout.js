(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function selText(select) {
    var o = select.options[select.selectedIndex];
    return o ? o.text : '';
  }

  var el = {
    name: $('f-name'), phone: $('f-phone'), email: $('f-email'),
    eName: $('e-name'), ePhone: $('e-phone'), eEmail: $('e-email'),
    inst: $('f-inst'), deptField: $('dept-field'), dept: $('f-dept'),
    levelField: $('level-field'), level: $('f-level'),
    handoutField: $('handout-field'), handoutList: $('handout-list'),
    feeCard: $('fee-card'), feeLabel: $('fee-title'), feeAmount: $('fee-amount'), feeFor: $('fee-for'),
    deliveryField: $('delivery-field'), choicePdf: $('choice-pdf'), choicePickup: $('choice-pickup'),
    note: $('delivery-note'), pay: $('pay-btn'), alert: $('page-alert')
  };

  // choices: the handouts the buyer can pick for this level (the ICT handout and any extra ones)
  // quote: the choice that is selected
  var choices = [];
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

  function clearSelection() {
    quote = null;
    hide(el.feeCard);
    hide(el.deliveryField);
    hide(el.note);
    hide(el.pay);
    Array.prototype.forEach.call(radios(), function (r) { r.checked = false; });
  }

  function resetQuote() {
    quoteSeq += 1;
    choices = [];
    el.handoutList.innerHTML = '';
    hide(el.handoutField);
    clearSelection();
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
    if (el.level.value) loadChoices();
  });

  /* ---------- Handouts, price and delivery ---------- */

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

    el.feeLabel.textContent = q.title;
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

  function selectChoice(c) {
    clearAlert();
    clearSelection();
    renderQuote(c);
  }

  function renderChooser() {
    el.handoutList.innerHTML = choices.map(function (c, i) {
      var text = c.blocked ? 'Not available yet.' : UI.naira(c.amount);
      return '<label class="choice">' +
        '<input type="radio" name="handout" value="' + i + '"' + (c.blocked ? ' disabled' : '') + '>' +
        '<span><span class="choice-title">' + UI.esc(c.title) + '</span>' +
        '<span class="choice-text">' + UI.esc(text) + '</span></span></label>';
    }).join('');
    show(el.handoutField);
  }

  el.handoutList.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || t.name !== 'handout') return;
    var c = choices[Number(t.value)];
    if (c) selectChoice(c);
  });

  function buildChoices(ictRes, extraRes) {
    var list = [];
    var inst = selText(el.inst);
    var dept = selText(el.dept);
    var lvl = selText(el.level);

    if (ictRes.q) {
      var q = ictRes.q;
      list.push({
        kind: 'ict', title: 'ICT course handout', amount: q.amount, options: q.options,
        blocked: !!q.blocked, message: q.message,
        institution: q.institution, department: q.department, level: q.level
      });
    }
    if (extraRes.r) {
      (extraRes.r.items || []).forEach(function (h) {
        list.push({
          kind: 'extra', id: h.id, title: h.title, amount: h.price, options: extraRes.r.options,
          blocked: false, message: null, institution: inst, department: dept, level: lvl
        });
      });
    }
    choices = list;

    if (!list.length) {
      var err = ictRes.err || extraRes.err;
      if (err) {
        var soft = err.code === 'PRICE_NOT_SET';
        showAlert(soft ? 'warning' : 'error', err.message, soft ? '' : 'Please try again.');
      } else {
        showAlert('warning', 'No handouts are available for this level yet.', 'Please contact your course lecturer.');
      }
      return;
    }

    if (list.length === 1) {
      selectChoice(list[0]);
      return;
    }
    renderChooser();
  }

  function loadChoices() {
    var id = ++quoteSeq;
    var params = { institution: el.inst.value, department: el.dept.value, level: el.level.value };
    UI.showLoader('Loading...');

    var ict = Api.get('/handouts/quote', params).then(
      function (q) { return { q: q }; },
      function (err) { return { err: err }; }
    );
    var extra = Api.get('/extra-handouts', params).then(
      function (r) { return { r: r }; },
      function (err) { return { err: err }; }
    );

    Promise.all([ict, extra]).then(function (res) {
      if (id !== quoteSeq) return;
      UI.hideLoader();
      buildChoices(res[0], res[1]);
    });
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

    var path;
    var body;
    if (quote.kind === 'extra') {
      path = '/extra-handouts/initialize';
      body = {
        name: details.name,
        phone: details.phone,
        email: details.email,
        handout: quote.id,
        delivery: delivery
      };
    } else {
      path = '/handouts/initialize';
      body = {
        name: details.name,
        phone: details.phone,
        email: details.email,
        institution: el.inst.value,
        department: el.dept.value,
        level: el.level.value,
        delivery: delivery
      };
    }

    el.pay.disabled = true;
    UI.showLoader('Taking you to Paystack...');
    Api.post(path, body).then(
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