(function () {
  'use strict';

  var NAIRA = '\u20A6';

  function $(id) { return document.getElementById(id); }

  var alertEl = $('page-alert');
  var ictData = [];
  var assignmentData = [];

  // Controls for each tab. "ict" and "as" (assignment) share the same filter code.
  var TABS = {
    ict: {
      list: $('ict-list'), q: $('ict-q'), inst: $('ict-inst'), dept: null, status: $('ict-status'),
      count: $('ict-count'), expand: $('ict-expand'), collapse: $('ict-collapse'), clear: $('ict-clear')
    },
    as: {
      list: $('assignment-list'), q: $('as-q'), inst: $('as-inst'), dept: $('as-dept'), status: $('as-status'),
      count: $('as-count'), expand: $('as-expand'), collapse: $('as-collapse'), clear: $('as-clear')
    }
  };

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }
  function inactiveBadge(item) { return item.isActive ? '' : ' ' + UI.badge('Inactive', 'grey'); }
  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

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

  // A collapsible institution card. The header is a button inside a heading.
  function cardHtml(kind, inst, summary, bodyHtml, open) {
    var bodyId = 'body-' + kind + '-' + inst.id;
    return '<section class="card price-card' + (open ? '' : ' collapsed') + '" data-inst-id="' + inst.id +
      '" data-inst-name="' + UI.esc(inst.name.toLowerCase()) + '">' +
      '<h2 class="price-card-heading"><button type="button" class="price-card-head" aria-expanded="' + open +
      '" aria-controls="' + bodyId + '">' +
      '<span class="price-card-chevron">' + UI.icon('chevron', 20) + '</span>' +
      '<span class="price-card-title">' + UI.esc(inst.name) + inactiveBadge(inst) + '</span>' +
      '<span class="price-card-summary">' + UI.esc(summary) + '</span>' +
      '</button></h2>' +
      '<div class="price-body" id="' + bodyId + '">' + bodyHtml + '</div></section>';
  }

  function renderIct(data) {
    var el = TABS.ict.list;
    if (!data.length) {
      el.innerHTML = emptyCard('No institutions yet. <a href="/admin/structure.html">Add them in Structure</a> first.');
      return;
    }
    var open = data.length <= 3;
    el.innerHTML = data.map(function (block) {
      var inst = block.institution;
      var rows = block.levels.map(function (l) {
        return '<div class="price-row' + (block.hasComputerScience ? ' price-row-three' : '') + '" data-kind="ict" data-institution="' + inst.id + '" data-level-key="' + UI.esc(l.levelKey) +
          '" data-level="' + UI.esc(l.levelLabel.toLowerCase()) + '" data-price-id="' + (l.priceId || '') + '">' +
          '<div class="price-level">' + UI.esc(l.levelLabel) + '</div>' +
          moneyField('ICT fee', 'ictFee', l.ictFee, l.levelLabel) +
          moneyField('Handout price', 'handoutPrice', l.handoutPrice, l.levelLabel) +
          (block.hasComputerScience
            ? moneyField('Departmental fee (Computer Science)', 'departmentalFee', l.departmentalFee, l.levelLabel)
            : '') +
          '<button type="button" class="btn btn-secondary btn-small" data-act="save">Save</button>' +
          '</div>';
      }).join('');
      var body = rows || '<p class="empty-state">No levels yet. <a href="/admin/structure.html">Add levels in Structure</a>.</p>';
      return cardHtml('ict', inst, plural(block.levels.length, 'level'), body, open);
    }).join('');
  }

  function renderAssignment(data) {
    var el = TABS.as.list;
    if (!data.length) {
      el.innerHTML = emptyCard('No institutions yet. <a href="/admin/structure.html">Add them in Structure</a> first.');
      return;
    }
    var open = data.length <= 3;
    el.innerHTML = data.map(function (block) {
      var inst = block.institution;
      var levelCount = 0;
      var groups = block.departments.map(function (d) {
        levelCount += d.levels.length;
        var rows = d.levels.map(function (l) {
          return '<div class="price-row price-row-assignment" data-kind="assignment" data-level-id="' + l.id +
            '" data-level="' + UI.esc(l.levelLabel.toLowerCase()) + '">' +
            '<div class="price-level">' + UI.esc(l.levelLabel) + inactiveBadge(l) + '</div>' +
            moneyField('Price per file', 'assignmentPerFile', l.assignmentPerFile, d.name + ' ' + l.levelLabel) +
            '<button type="button" class="btn btn-secondary btn-small" data-act="save">Save</button>' +
            '</div>';
        }).join('');
        return '<div class="price-dept-group" data-dept-id="' + d.id + '" data-dept-name="' + UI.esc(d.name.toLowerCase()) + '">' +
          '<h3 class="price-dept">' + UI.esc(d.name) + inactiveBadge(d) + '</h3>' +
          (rows || '<p class="hint">No levels yet. <a href="/admin/structure.html">Add levels in Structure</a>.</p>') +
          '</div>';
      }).join('');
      var body = groups || '<p class="empty-state">No departments yet. <a href="/admin/structure.html">Add them in Structure</a>.</p>';
      var summary = plural(block.departments.length, 'department') + ' \u00B7 ' + plural(levelCount, 'level');
      return cardHtml('as', inst, summary, body, open);
    }).join('');
  }

  /* ---------- Filters ---------- */

  function setCollapsed(card, collapsed) {
    card.classList.toggle('collapsed', collapsed);
    var head = card.querySelector('.price-card-head');
    if (head) head.setAttribute('aria-expanded', String(!collapsed));
  }

  function rowStatus(row) {
    var inputs = row.querySelectorAll('input[data-field]');
    for (var i = 0; i < inputs.length; i++) {
      if (inputs[i].value.trim() === '') return 'missing';
    }
    return 'set';
  }

  function applyFilters(key, expandMatches) {
    var t = TABS[key];
    var q = t.q.value.trim().toLowerCase();
    var instId = t.inst.value;
    var deptId = t.dept ? t.dept.value : '';
    var status = t.status.value;
    var active = !!(q || instId || deptId || status !== 'all');
    var total = 0;
    var shown = 0;

    t.list.querySelectorAll('.price-card').forEach(function (card) {
      var instName = card.getAttribute('data-inst-name');
      var instOk = !instId || card.getAttribute('data-inst-id') === instId;
      var visibleInCard = 0;

      card.querySelectorAll('.price-row').forEach(function (row) {
        total += 1;
        var level = row.getAttribute('data-level');
        var group = row.closest('.price-dept-group');
        var deptName = group ? group.getAttribute('data-dept-name') : '';
        var textOk = !q || instName.indexOf(q) !== -1 || level.indexOf(q) !== -1 || deptName.indexOf(q) !== -1;
        var deptOk = !deptId || (group !== null && group.getAttribute('data-dept-id') === deptId);
        var statusOk = status === 'all' || rowStatus(row) === status;
        var show = instOk && textOk && deptOk && statusOk;
        row.hidden = !show;
        if (show) { visibleInCard += 1; shown += 1; }
      });

      card.querySelectorAll('.price-dept-group').forEach(function (g) {
        g.hidden = !g.querySelector('.price-row:not([hidden])');
      });

      card.hidden = active && visibleInCard === 0;
      if (expandMatches && active && !card.hidden) setCollapsed(card, false);
    });

    if (!active) t.count.textContent = '';
    else if (shown === 0) t.count.textContent = 'No prices match your filters.';
    else t.count.textContent = shown + ' of ' + plural(total, 'level') + ' shown';
  }

  function setAll(key, collapsed) {
    TABS[key].list.querySelectorAll('.price-card').forEach(function (card) {
      if (!card.hidden) setCollapsed(card, collapsed);
    });
  }

  function fillInstitutionSelects() {
    var options = ictData.map(function (b) { return { id: b.institution.id, name: b.institution.name }; });
    UI.fillSelect(TABS.ict.inst, options, { placeholder: 'All institutions' });
    UI.fillSelect(TABS.as.inst, options, { placeholder: 'All institutions' });
  }

  // Departments follow the chosen institution. With "All institutions" the institution is shown in brackets.
  function fillDepartmentSelect() {
    var instId = TABS.as.inst.value;
    var options = [];
    assignmentData.forEach(function (b) {
      if (instId && b.institution.id !== instId) return;
      b.departments.forEach(function (d) {
        options.push({ id: d.id, name: instId ? d.name : d.name + ' (' + b.institution.name + ')' });
      });
    });
    var previous = TABS.as.dept.value;
    UI.fillSelect(TABS.as.dept, options, { placeholder: 'All departments' });
    if (options.some(function (o) { return o.id === previous; })) TABS.as.dept.value = previous;
  }

  Object.keys(TABS).forEach(function (key) {
    var t = TABS[key];
    function run() { applyFilters(key, true); }

    t.q.addEventListener('input', run);
    t.status.addEventListener('change', run);
    t.inst.addEventListener('change', function () {
      if (t.dept) { t.dept.value = ''; fillDepartmentSelect(); }
      run();
    });
    if (t.dept) t.dept.addEventListener('change', run);

    t.expand.addEventListener('click', function () { setAll(key, false); });
    t.collapse.addEventListener('click', function () { setAll(key, true); });
    t.clear.addEventListener('click', function () {
      t.q.value = '';
      t.inst.value = '';
      t.status.value = 'all';
      if (t.dept) { t.dept.value = ''; fillDepartmentSelect(); }
      applyFilters(key, false);
    });
  });

  /* ---------- Data ---------- */

  function load() {
    UI.showLoader('Loading...');
    return Promise.all([Api.get('/admin/prices'), Api.get('/admin/prices/assignment')]).then(
      function (r) {
        UI.hideLoader();
        ictData = r[0];
        assignmentData = r[1];
        renderIct(ictData);
        renderAssignment(assignmentData);
        fillInstitutionSelects();
        fillDepartmentSelect();
        applyFilters('ict', false);
        applyFilters('as', false);
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
    var noDepartmental = values.departmentalFee === undefined || values.departmentalFee === null;
    if (values.ictFee === null && values.handoutPrice === null && noDepartmental) {
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
        handoutPrice: values.handoutPrice,
        departmentalFee: values.departmentalFee
      }),
      function (doc) {
        row.setAttribute('data-price-id', doc._id);
        UI.toast('Price saved', 'success');
      });
  }

  function onClick(e) {
    var head = e.target.closest('.price-card-head');
    if (head) {
      var card = head.closest('.price-card');
      setCollapsed(card, !card.classList.contains('collapsed'));
      return;
    }
    var btn = e.target.closest('button[data-act="save"]');
    if (btn) saveRow(btn.closest('.price-row'), btn);
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' || !e.target.matches('input[data-field]')) return;
    e.preventDefault();
    var row = e.target.closest('.price-row');
    saveRow(row, row.querySelector('button[data-act="save"]'));
  }

  Object.keys(TABS).forEach(function (key) {
    TABS[key].list.addEventListener('click', onClick);
    TABS[key].list.addEventListener('keydown', onKeydown);
  });

  /* ---------- Tabs ---------- */

  function selectTab(which) {
    var ict = which === 'ict';
    $('tab-ict').setAttribute('aria-selected', String(ict));
    $('tab-assignment').setAttribute('aria-selected', String(!ict));
    $('panel-ict').classList.toggle('hidden', !ict);
    $('panel-assignment').classList.toggle('hidden', ict);
    clearAlert();
  }

  $('tab-ict').addEventListener('click', function () { selectTab('ict'); });
  $('tab-assignment').addEventListener('click', function () { selectTab('assignment'); });

  Auth.init({ page: 'prices', roles: ['superadmin'] }).then(load);
})();