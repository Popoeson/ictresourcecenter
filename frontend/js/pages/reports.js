(function () {
  'use strict';

  var PAGE_SIZE = 25;

  var TABS = {
    students: {
      sub: 'How many students offer the course, by institution, department and level.',
      dates: false,
      views: null
    },
    submissions: {
      sub: 'Who has submitted assignments, and who has not.',
      dates: true,
      views: [['class', 'By class'], ['student', 'By student'], ['missing', 'Not yet submitted']]
    },
    payments: {
      sub: 'Money collected, by payment type or by institution.',
      dates: true,
      views: [['type', 'By payment type'], ['institution', 'By institution']]
    },
    handouts: {
      sub: 'Handout orders, with Student or Non-student buyers and pickup status.',
      dates: true,
      views: null
    }
  };

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }

  var state = { tab: 'students', page: 1, totalPages: 1, total: 0, columns: [] };
  var requestId = 0;

  var alertEl = $('page-alert');
  var el = {
    tabs: $('report-tabs'), sub: $('tab-sub'),
    fldView: $('fld-view'), view: $('f-view'),
    inst: $('f-inst'), dept: $('f-dept'), level: $('f-level'),
    fldFrom: $('fld-from'), fldTo: $('fld-to'), from: $('f-from'), to: $('f-to'),
    clear: $('f-clear'), exportBtn: $('export-btn'),
    stats: $('stat-grid'), chartCard: $('chart-card'), chartTitle: $('chart-title'), chartRows: $('chart-rows'),
    count: $('report-count'), empty: $('report-empty'), wrap: $('report-wrap'),
    head: $('report-head'), body: $('report-body'),
    pager: $('pager'), prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info')
  };

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  function fmt(kind, v) {
    if (kind === 'money') return UI.naira(v || 0);
    if (kind === 'number') return Number(v || 0).toLocaleString('en-NG');
    if (kind === 'date') return v ? UI.fmtDate(v) : '\u2014';
    return v === undefined || v === null || v === '' ? '\u2014' : String(v);
  }

  /* ---------- Filters ---------- */

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
    loadReport(1);
  });

  el.dept.addEventListener('change', function () {
    resetSelect(el.level, 'All levels');
    if (el.dept.value) {
      Api.get('/lookups/levels', { department: el.dept.value }).then(function (list) {
        UI.fillSelect(el.level, toOptions(list), { placeholder: 'All levels' });
        el.level.disabled = false;
      }, function (err) { showAlert('error', err.message, ''); });
    }
    loadReport(1);
  });

  [el.level, el.view, el.from, el.to].forEach(function (c) {
    c.addEventListener('change', function () { loadReport(1); });
  });

  el.clear.addEventListener('click', function () {
    el.inst.value = '';
    el.from.value = '';
    el.to.value = '';
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadReport(1);
  });

  function params() {
    var cfg = TABS[state.tab];
    return {
      view: cfg.views ? el.view.value : '',
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      from: cfg.dates ? el.from.value : '',
      to: cfg.dates ? el.to.value : ''
    };
  }

  /* ---------- Tabs ---------- */

  function setTab(name) {
    state.tab = name;
    var cfg = TABS[name];

    Array.prototype.forEach.call(el.tabs.querySelectorAll('.report-tab'), function (b) {
      var on = b.getAttribute('data-tab') === name;
      b.setAttribute('aria-selected', on ? 'true' : 'false');
      b.tabIndex = on ? 0 : -1;
    });

    el.sub.textContent = cfg.sub;
    el.fldFrom.classList.toggle('hidden', !cfg.dates);
    el.fldTo.classList.toggle('hidden', !cfg.dates);

    if (cfg.views) {
      UI.fillSelect(el.view, cfg.views.map(function (v) { return { id: v[0], name: v[1] }; }), {});
      el.view.value = cfg.views[0][0];
      el.fldView.classList.remove('hidden');
    } else {
      el.fldView.classList.add('hidden');
    }
    loadReport(1);
  }

  el.tabs.addEventListener('click', function (e) {
    var b = e.target.closest('.report-tab');
    if (b && b.getAttribute('data-tab') !== state.tab) setTab(b.getAttribute('data-tab'));
  });

  // Arrow keys move between tabs
  el.tabs.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    var names = Object.keys(TABS);
    var i = names.indexOf(state.tab) + (e.key === 'ArrowRight' ? 1 : -1);
    i = (i + names.length) % names.length;
    setTab(names[i]);
    el.tabs.querySelector('[data-tab="' + names[i] + '"]').focus();
  });

  /* ---------- Render ---------- */

  function renderStats(columns, totals) {
    if (!totals) { el.stats.classList.add('hidden'); el.stats.innerHTML = ''; return; }
    el.stats.innerHTML = columns.filter(function (c) {
      return c.kind === 'number' || c.kind === 'money';
    }).map(function (c) {
      return '<div class="stat-card"><div class="stat-value">' + UI.esc(fmt(c.kind, totals[c.key])) + '</div>' +
        '<div class="stat-label">' + UI.esc(c.header) + '</div></div>';
    }).join('');
    el.stats.classList.remove('hidden');
  }

  function renderChart(chart) {
    var items = chart && chart.items ? chart.items.filter(function (i) { return i.value > 0; }) : [];
    if (!items.length) { el.chartCard.classList.add('hidden'); el.chartRows.innerHTML = ''; return; }
    var max = items.reduce(function (m, i) { return Math.max(m, i.value); }, 0);
    el.chartTitle.textContent = chart.title;
    el.chartRows.innerHTML = items.map(function (i) {
      var text = fmt(chart.kind, i.value);
      return '<div class="chart-row">' +
        '<span class="chart-label">' + UI.esc(i.label) + '</span>' +
        '<span class="chart-value">' + UI.esc(text) + '</span>' +
        '<progress class="chart-bar" max="' + max + '" value="' + i.value + '" aria-label="' +
          UI.esc(i.label + ': ' + text) + '"></progress></div>';
    }).join('');
    el.chartCard.classList.remove('hidden');
  }

  function rowHtml(columns, row) {
    return '<tr>' + columns.map(function (c, i) {
      var text = UI.esc(fmt(c.kind, row[c.key]));
      var inner = i === 0 || c.key === 'student' ? '<span class="student-name">' + text + '</span>' : text;
      return '<td data-label="' + UI.esc(c.header) + '">' + inner + '</td>';
    }).join('') + '</tr>';
  }

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function filtersActive() {
    var p = params();
    return !!(p.institution || p.department || p.level || p.from || p.to);
  }

  function render(data) {
    state.page = Number(data.page) || 1;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;
    state.columns = data.columns;

    renderStats(data.columns, data.totals);
    renderChart(data.chart);

    if (!data.items.length) {
      el.count.textContent = '';
      var missing = state.tab === 'submissions' && el.view.value === 'missing';
      showEmpty(missing
        ? 'Every student has submitted for this filter.'
        : (filtersActive() ? 'Nothing matches your filters.' : 'No data yet.'));
      return;
    }

    el.empty.classList.add('hidden');
    el.head.innerHTML = data.columns.map(function (c) { return '<th>' + UI.esc(c.header) + '</th>'; }).join('');
    el.body.innerHTML = data.items.map(function (r) { return rowHtml(data.columns, r); }).join('');
    el.wrap.classList.remove('hidden');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' row' + (state.total === 1 ? '' : 's');

    el.pager.classList.toggle('hidden', state.totalPages <= 1);
    el.info.textContent = 'Page ' + state.page + ' of ' + state.totalPages;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= state.totalPages;
  }

  function loadReport(page) {
    var p = params();
    if (p.from && p.to && p.from > p.to) {
      showAlert('warning', 'The "From" date is after the "To" date.', 'Change one of them.');
      return;
    }
    var id = ++requestId;
    clearAlert();
    el.count.textContent = 'Loading report...';
    var query = {
      page: page || 1, limit: PAGE_SIZE,
      view: p.view, institution: p.institution, department: p.department, level: p.level, from: p.from, to: p.to
    };
    Api.get('/admin/reports/' + state.tab, query).then(
      function (data) { if (id === requestId) render(data); },
      function (err) {
        if (id !== requestId) return;
        el.count.textContent = '';
        el.wrap.classList.add('hidden');
        el.pager.classList.add('hidden');
        el.empty.classList.add('hidden');
        el.stats.classList.add('hidden');
        el.chartCard.classList.add('hidden');
        showAlert('error', err.message, 'Change a filter or reload the page to try again.');
      }
    );
  }

  el.prev.addEventListener('click', function () { loadReport(state.page - 1); });
  el.next.addEventListener('click', function () { loadReport(state.page + 1); });

  /* ---------- Export ---------- */

  el.exportBtn.addEventListener('click', function () {
    var p = params();
    if (p.from && p.to && p.from > p.to) {
      showAlert('warning', 'The "From" date is after the "To" date.', 'Change one of them.');
      return;
    }
    clearAlert();
    el.exportBtn.disabled = true;
    UI.showLoader('Preparing your download...');
    Api.download('/admin/reports/' + state.tab + '/export', p).then(
      function () { UI.hideLoader(); el.exportBtn.disabled = false; UI.toast('Export downloaded', 'success'); },
      function (err) {
        UI.hideLoader();
        el.exportBtn.disabled = false;
        showAlert(err.status === 400 || err.status === 404 ? 'warning' : 'error', err.message, '');
      }
    );
  });

  /* ---------- Start ---------- */

  Auth.init({ page: 'reports' }).then(function () {
    UI.fillSelect(el.inst, [], { placeholder: 'All institutions' });
    Api.get('/lookups/institutions').then(function (list) {
      UI.fillSelect(el.inst, toOptions(list), { placeholder: 'All institutions' });
    }, function (err) {
      showAlert('error', err.message, 'Filters may be missing. Reload the page to try again.');
    });
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    setTab('students');
  });
})();