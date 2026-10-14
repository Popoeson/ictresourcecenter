(function () {
  'use strict';

  var NAIRA = '\u20A6';
  var alertEl = document.getElementById('page-alert');
  var ictEl = document.getElementById('ict-list');
  var assignmentEl = document.getElementById('assignment-list');

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  function inactiveBadge(item) { return item.isActive ? '' : ' ' + UI.badge('Inactive', 'grey'); }

  /* ---------- Rendering ---------- */

  function moneyField(label, field, kobo, rowLabel) {
    var value = kobo === null || kobo === undefined ? '' : String(kobo / 100);
    return '<div class="field price-field">' +
      '<label>' + UI.esc(label) + '</label>' +
      '<div class="money-wrap"><span aria-hidden="true">' + NAIRA + '</span>' +
      '<input class="input" inputmode="decimal" autocomplete="off" data-field="' + field + '" value="' + UI.esc(value) + '"' +
      ' placeholder="Not set" aria-label="' + UI.esc(label + ' for ' + rowLabel) + '"></div></div>';
  }

  function emptyCard(text) {
    return '<div class="card"><p class="empty-state">' + text + '</p></div>';
  }

  function renderIct(data) {
    if (!data.length) {
      ictEl.innerHTML = emptyCard('No institutions yet. <a href="/admin/structure.html">Add them in Structure</a> first.');
      return;
    }
    ictEl.innerHTML = data.map(function (block) {
      var inst = block.institution;
      var rows = block.levels.map(function (l) {
        return '<div class="price-row" data-kind="ict" data-institution="' + inst.id + '" data-level-key="' + UI.esc(l.levelKey) +
          '" data-price-id="' + (l.priceId || '') + '">' +
          '<div class="price-level">' + UI.esc(l.levelLabel) + '</div>' +
          moneyField('ICT fee', 'ictFee', l.ictFee, l.levelLabel) +
          moneyField('Handout price', 'handoutPrice', l.handoutPrice, l.levelLabel) +
          '<button type="button" class="btn btn-secondary btn-small" data-act="save">Save</button>' +
          '</div>';
      }).join('');
      return '<section class="card price-card"><h2>' + UI.esc(inst.name) + inactiveBadge(inst) + '</h2>' +
        (rows || '<p class="empty-state">No levels yet. <a href="/admin/structure.html">Add levels in Structure</a>.</p>') +
        '</section>';
    }).join('');
  }

  function renderAssignment(data) {
    if (!data.length) {
      assignmentEl.innerHTML = emptyCard('No institutions yet. <a href="/admin/structure.html">Add them in Structure</a> first.');
      return;
    }
    assignmentEl.innerHTML = data.map(function (block) {
      var inst = block.institution;
      var depts = block.departments.map(function (d) {
        var rows = d.levels.map(function (l) {
          return '<div class="price-row price-row-assignment" data-kind="assignment" data-level-id="' + l.id + '">' +
            '<div class="price-level">' + UI.esc(l.levelLabel) + inactiveBadge(l) + '</div>' +
            moneyField('Price per file', 'assignmentPerFile', l.assignmentPerFile, d.name + ' ' + l.levelLabel) +
            '<button type="button" class="btn btn-secondary btn-small" data-act="save">Save</button>' +
            '</div>';
        }).join('');
        return '<h3 class="price-dept">' + UI.esc(d.name) + inactiveBadge(d) + '</h3>' +
          (rows || '<p class="hint">No levels yet. <a href="/admin/structure.html">Add levels in Structure</a>.</p>');
      }).join('');
      return '<section class="card price-card"><h2>' + UI.esc(inst.name) + inactiveBadge(inst) + '</h2>' +
        (depts || '<p class="empty-state">No departments yet. <a href="/admin/structure.html">Add them in Structure</a>.</p>') +
        '</section>';
    }).join('');
  }

  /* ---------- Data ---------- */

  function load() {
    UI.showLoader('Loading...');
    return Promise.all([Api.get('/admin/prices'), Api.get('/admin/prices/assignment')]).then(
      function (r) {
        UI.hideLoader();
        renderIct(r[0]);
        renderAssignment(r[1]);
      },
      function (err) {
        UI.hideLoader();
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  }

  /* ---------- Saving ---------- */

  // Empty means "not set" (null). Otherwise naira to kobo, greater than zero.
  function readAmount(input) {
    var text = input.value.trim();
    if (text === '') return { ok: true, kobo: null };
    var kobo = UI.toKobo(text);
    if (kobo === null) { UI.setFieldError(input, 'Enter a valid amount.'); return { ok: false }; }
    if (kobo <= 0) { UI.setFieldError(input, 'Amount must be greater than zero.'); return { ok: false }; }
    return { ok: true, kobo: kobo };
  }

  function runSave(btn, firstInput, request, onOk) {
    btn.disabled = true;
    btn.textContent = 'Saving...';
    request.then(
      function (result) {
        btn.disabled = false;
        btn.textContent = 'Save';
        onOk(result);
      },
      function (err) {
        btn.disabled = false;
        btn.textContent = 'Save';
        UI.setFieldError(firstInput, err.message);
      }
    );
  }

  function saveRow(row, btn) {
    var inputs = Array.prototype.slice.call(row.querySelectorAll('input[data-field]'));
    inputs.forEach(UI.clearFieldError);
    clearAlert();

    var values = {};
    var ok = true;
    inputs.forEach(function (input) {
      var r = readAmount(input);
      if (!r.ok) ok = false;
      else values[input.getAttribute('data-field')] = r.kobo;
    });
    if (!ok) return;

    if (row.getAttribute('data-kind') === 'assignment') {
      var kobo = values.assignmentPerFile;
      runSave(btn, inputs[0],
        Api.put('/admin/prices/assignment', { level: row.getAttribute('data-level-id'), assignmentPerFile: kobo }),
        function () { UI.toast(kobo === null ? 'Price cleared' : 'Price saved', 'success'); });
      return;
    }

    var priceId = row.getAttribute('data-price-id');
    if (values.ictFee === null && values.handoutPrice === null) {
      if (!priceId) { UI.setFieldError(inputs[0], 'Enter at least one amount.'); return; }
      runSave(btn, inputs[0], Api.del('/admin/prices/' + priceId), function () {
        row.setAttribute('data-price-id', '');
        UI.toast('Prices cleared', 'success');
      });
      return;
    }

    runSave(btn, inputs[0],
      Api.put('/admin/prices', {
        institution: row.getAttribute('data-institution'),
        levelKey: row.getAttribute('data-level-key'),
        ictFee: values.ictFee,
        handoutPrice: values.handoutPrice
      }),
      function (doc) {
        row.setAttribute('data-price-id', doc._id);
        UI.toast('Price saved', 'success');
      });
  }

  function onClick(e) {
    var btn = e.target.closest('button[data-act="save"]');
    if (!btn) return;
    saveRow(btn.closest('.price-row'), btn);
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' || !e.target.matches('input[data-field]')) return;
    e.preventDefault();
    var row = e.target.closest('.price-row');
    saveRow(row, row.querySelector('button[data-act="save"]'));
  }

  [ictEl, assignmentEl].forEach(function (el) {
    el.addEventListener('click', onClick);
    el.addEventListener('keydown', onKeydown);
  });

  /* ---------- Tabs ---------- */

  function selectTab(which) {
    var ict = which === 'ict';
    document.getElementById('tab-ict').setAttribute('aria-selected', String(ict));
    document.getElementById('tab-assignment').setAttribute('aria-selected', String(!ict));
    document.getElementById('panel-ict').classList.toggle('hidden', !ict);
    document.getElementById('panel-assignment').classList.toggle('hidden', ict);
    clearAlert();
  }

  document.getElementById('tab-ict').addEventListener('click', function () { selectTab('ict'); });
  document.getElementById('tab-assignment').addEventListener('click', function () { selectTab('assignment'); });

  Auth.init({ page: 'prices', roles: ['superadmin'] }).then(load);
})();