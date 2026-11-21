(function () {
  'use strict';

  var NAIRA = '\u20A6';

  function $(id) { return document.getElementById(id); }

  var el = {
    alert: $('dues-alert'),
    max: $('dues-max'),
    min: $('dues-min'),
    save: $('dues-settings-save'),
    list: $('dues-list')
  };

  function showAlert(type, title, text) { el.alert.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { el.alert.innerHTML = ''; }

  function moneyField(label, field, kobo, rowLabel) {
    var value = kobo === null || kobo === undefined ? '' : String(kobo / 100);
    return '<div class="field price-field">' +
      '<label>' + UI.esc(label) + '</label>' +
      '<div class="money-wrap"><span aria-hidden="true">' + NAIRA + '</span>' +
      '<input class="input" inputmode="decimal" autocomplete="off" data-field="' + field + '" value="' + UI.esc(value) + '"' +
      ' placeholder="Not set" aria-label="' + UI.esc(label + ' for ' + rowLabel) + '"></div></div>';
  }

  /* ---------- Instalment settings ---------- */

  function fillSettings(s) {
    el.max.value = String(s.maxInstalments);
    el.min.value = s.minInstalment ? String(s.minInstalment / 100) : '';
  }

  el.save.addEventListener('click', function () {
    UI.clearFieldError(el.max);
    UI.clearFieldError(el.min);
    clearAlert();

    var max = Number(String(el.max.value).trim());
    if (!Number.isInteger(max) || max < 1 || max > 10) {
      UI.setFieldError(el.max, 'Enter a whole number from 1 to 10.');
      return;
    }

    var minText = String(el.min.value).trim();
    var minKobo = 0;
    if (minText !== '') {
      minKobo = UI.toKobo(minText);
      if (minKobo === null || minKobo < 0) {
        UI.setFieldError(el.min, 'Enter a valid amount, or leave it empty for no minimum.');
        return;
      }
    }

    el.save.disabled = true;
    el.save.textContent = 'Saving...';
    Api.put('/admin/dues-settings', { maxInstalments: max, minInstalment: minKobo }).then(
      function (s) {
        el.save.disabled = false;
        el.save.textContent = 'Save settings';
        fillSettings(s);
        UI.toast('Settings saved', 'success');
      },
      function (err) {
        el.save.disabled = false;
        el.save.textContent = 'Save settings';
        UI.setFieldError(el.max, err.message);
      }
    );
  });

  /* ---------- Total dues per institution and level ---------- */

  function render(blocks) {
    var eligible = blocks.filter(function (b) { return b.hasComputerScience; });
    if (!eligible.length) {
      el.list.innerHTML = '<div class="card"><p class="empty-state">No institution has a Computer Science or Computer Engineering department yet. ' +
        '<a href="/admin/structure.html">Add one in Structure</a>.</p></div>';
      return;
    }

    el.list.innerHTML = eligible.map(function (block) {
      var inst = block.institution;
      var rows = block.levels.map(function (l) {
        return '<div class="price-row price-row-assignment" data-institution="' + inst.id +
          '" data-level-key="' + UI.esc(l.levelKey) + '" data-price-id="' + (l.priceId || '') + '">' +
          '<div class="price-level">' + UI.esc(l.levelLabel) + '</div>' +
          moneyField('Total dues', 'infrastructureDues', l.infrastructureDues, l.levelLabel) +
          '<button type="button" class="btn btn-secondary btn-small" data-act="save">Save</button>' +
          '</div>';
      }).join('');
      return '<section class="card"><h3 class="price-dept">' + UI.esc(inst.name) + '</h3>' +
        (rows || '<p class="empty-state">No levels yet. <a href="/admin/structure.html">Add levels in Structure</a>.</p>') +
        '</section>';
    }).join('');
  }

  function saveRow(row, btn) {
    var input = row.querySelector('input[data-field]');
    UI.clearFieldError(input);
    clearAlert();

    var text = input.value.trim();
    var kobo = null;
    if (text !== '') {
      kobo = UI.toKobo(text);
      if (kobo === null) { UI.setFieldError(input, 'Enter a valid amount.'); return; }
      if (kobo <= 0) { UI.setFieldError(input, 'Amount must be greater than zero.'); return; }
    }
    if (kobo === null && !row.getAttribute('data-price-id')) {
      UI.setFieldError(input, 'Enter the total dues amount.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';
    Api.put('/admin/prices', {
      institution: row.getAttribute('data-institution'),
      levelKey: row.getAttribute('data-level-key'),
      infrastructureDues: kobo
    }).then(
      function (doc) {
        btn.disabled = false;
        btn.textContent = 'Save';
        row.setAttribute('data-price-id', doc._id);
        UI.toast(kobo === null ? 'Dues cleared' : 'Dues saved', 'success');
      },
      function (err) {
        btn.disabled = false;
        btn.textContent = 'Save';
        UI.setFieldError(input, err.message);
      }
    );
  }

  el.list.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act="save"]');
    if (btn) saveRow(btn.closest('.price-row'), btn);
  });

  el.list.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' || !e.target.matches('input[data-field]')) return;
    e.preventDefault();
    var row = e.target.closest('.price-row');
    saveRow(row, row.querySelector('button[data-act="save"]'));
  });

  /* ---------- Start ---------- */

  el.list.innerHTML = '<p class="hint">Loading...</p>';
  Promise.all([Api.get('/admin/dues-settings'), Api.get('/admin/prices')]).then(
    function (r) {
      fillSettings(r[0]);
      render(r[1]);
    },
    function (err) {
      el.list.innerHTML = '';
      showAlert('error', err.message, 'Reload the page to try again.');
    }
  );
})();