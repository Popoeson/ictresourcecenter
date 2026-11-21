(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var MAX_BYTES = 10 * 1024 * 1024;

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function fmtSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
  function naira(kobo) {
    var n = (Number(kobo) || 0) / 100;
    return '\u20A6' + n.toLocaleString('en-NG', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
  }

  var state = { page: 1, totalPages: 1, total: 0, items: [] };
  var requestId = 0;
  var mode = null; // 'create' or 'edit'
  var editing = null;
  var selected = null;

  var el = {
    alert: $('x-alert'),
    add: $('x-add'),
    card: $('x-card'), title: $('x-card-title'), cardAlert: $('x-card-alert'),
    scope: $('x-scope'), target: $('x-target'),
    name: $('x-title'), inst: $('x-inst'), dept: $('x-dept'), level: $('x-level'), price: $('x-price'),
    dropzone: $('x-dropzone'), file: $('x-file'), fileHint: $('x-file-hint'),
    chip: $('x-chip'), chipName: $('x-chip-name'), chipSize: $('x-chip-size'), chipRemove: $('x-chip-remove'),
    save: $('x-save'), cancel: $('x-cancel'),
    count: $('x-count'), empty: $('x-empty'), wrap: $('x-wrap'), body: $('x-body'),
    pager: $('x-pager'), prev: $('x-prev'), next: $('x-next'), info: $('x-info')
  };

  function showAlert(type, title, text) { el.alert.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { el.alert.innerHTML = ''; }

  /* ---------- List ---------- */

  function showEmpty(text) {
    el.empty.innerHTML = '<p class="empty-state">' + text + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function rowHtml(r) {
    var status = r.isActive ? UI.badge('Active', 'green') : UI.badge('Off', 'grey');
    return '<tr>' +
      '<td data-label="Title"><span class="student-name">' + UI.esc(r.title) + '</span>' +
        '<div class="hint">' + UI.esc(r.file.originalName) + ' \u00B7 ' + UI.esc(fmtSize(r.file.bytes)) + '</div></td>' +
      '<td data-label="Institution">' + UI.esc(r.institution) + '</td>' +
      '<td data-label="Department">' + UI.esc(r.department) + '</td>' +
      '<td data-label="Level">' + UI.esc(r.level) + '</td>' +
      '<td data-label="Price">' + UI.esc(naira(r.price)) + '</td>' +
      '<td data-label="Status">' + status + '</td>' +
      '<td class="cell-actions" data-label="Actions">' +
        '<button type="button" class="btn btn-secondary btn-small" data-act="edit" data-id="' + UI.esc(r.id) + '">Edit</button> ' +
        '<button type="button" class="btn btn-secondary btn-small" data-act="toggle" data-id="' + UI.esc(r.id) + '">' +
        (r.isActive ? 'Turn off' : 'Turn on') + '</button></td>' +
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
      showEmpty('No extra handouts yet. Use Add handout to upload the first one.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total;

    el.pager.classList.toggle('hidden', state.totalPages <= 1);
    el.info.textContent = 'Page ' + state.page + ' of ' + state.totalPages;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= state.totalPages;
  }

  function loadList(page) {
    var id = ++requestId;
    clearAlert();
    el.count.textContent = 'Loading...';
    Api.get('/admin/extra-handouts', { page: page || 1, limit: PAGE_SIZE }).then(
      function (data) { if (id === requestId) render(data); },
      function (err) {
        if (id !== requestId) return;
        el.count.textContent = '';
        el.wrap.classList.add('hidden');
        el.pager.classList.add('hidden');
        el.empty.classList.add('hidden');
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  }

  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Panel ---------- */

  function renderSelected() {
    if (selected) {
      el.chipName.textContent = selected.name;
      el.chipSize.textContent = fmtSize(selected.size);
      el.chip.classList.remove('hidden');
    } else {
      el.chip.classList.add('hidden');
    }
  }

  function setFile(file) {
    el.cardAlert.innerHTML = '';
    selected = null;
    if (file) {
      if (!/\.pdf$/i.test(file.name)) {
        el.cardAlert.innerHTML = UI.alertHtml('error', 'That file type is not allowed.', 'Handouts must be PDF files.');
      } else if (file.size === 0) {
        el.cardAlert.innerHTML = UI.alertHtml('error', 'That file is empty.', 'Choose a different PDF.');
      } else if (file.size > MAX_BYTES) {
        el.cardAlert.innerHTML = UI.alertHtml('error', 'This file is larger than 10 MB.', 'Make the PDF smaller and try again.');
      } else {
        selected = file;
      }
    }
    if (!selected) el.file.value = '';
    renderSelected();
  }

  el.file.addEventListener('change', function () { setFile(el.file.files[0] || null); });
  el.chipRemove.addEventListener('click', function () { setFile(null); });

  ['dragenter', 'dragover'].forEach(function (type) {
    el.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      el.dropzone.classList.add('dragging');
    });
  });
  ['dragleave', 'drop'].forEach(function (type) {
    el.dropzone.addEventListener(type, function (e) {
      e.preventDefault();
      el.dropzone.classList.remove('dragging');
    });
  });
  el.dropzone.addEventListener('drop', function (e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) setFile(files[0]);
  });

  function resetDept() {
    UI.fillSelect(el.dept, [], { placeholder: 'Select department' });
    el.dept.disabled = true;
  }
  function resetLevel() {
    UI.fillSelect(el.level, [], { placeholder: 'Select level' });
    el.level.disabled = true;
  }

  el.inst.addEventListener('change', function () {
    resetDept();
    resetLevel();
    if (!el.inst.value) return;
    Api.get('/lookups/departments', { institution: el.inst.value }).then(function (list) {
      UI.fillSelect(el.dept, toOptions(list), { placeholder: 'Select department' });
      el.dept.disabled = false;
    }, function (err) {
      el.cardAlert.innerHTML = UI.alertHtml('error', err.message, '');
    });
  });

  el.dept.addEventListener('change', function () {
    resetLevel();
    if (!el.dept.value) return;
    Api.get('/lookups/levels', { department: el.dept.value }).then(function (list) {
      UI.fillSelect(el.level, toOptions(list), { placeholder: 'Select level' });
      el.level.disabled = false;
    }, function (err) {
      el.cardAlert.innerHTML = UI.alertHtml('error', err.message, '');
    });
  });

  function openPanel(m, item) {
    mode = m;
    editing = item || null;
    el.cardAlert.innerHTML = '';
    setFile(null);

    if (m === 'create') {
      el.title.textContent = 'Add handout';
      el.scope.classList.remove('hidden');
      el.target.classList.add('hidden');
      el.name.value = '';
      el.price.value = '';
      el.inst.value = '';
      resetDept();
      resetLevel();
      el.fileHint.textContent = 'PDF only, up to 10 MB.';
      el.save.textContent = 'Add handout';
    } else {
      el.title.textContent = 'Edit handout';
      el.scope.classList.add('hidden');
      el.target.classList.remove('hidden');
      el.target.textContent = item.institution + ' \u00B7 ' + item.department + ' \u00B7 ' + item.level;
      el.name.value = item.title;
      el.price.value = String((Number(item.price) || 0) / 100);
      el.fileHint.textContent = 'Optional. Choose a PDF only if you want to replace the current one (' + item.file.originalName + ').';
      el.save.textContent = 'Save changes';
    }
    el.save.disabled = false;
    el.card.classList.remove('hidden');
    el.card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.title.focus({ preventScroll: true });
  }

  function closePanel() {
    mode = null;
    editing = null;
    setFile(null);
    el.card.classList.add('hidden');
  }

  el.add.addEventListener('click', function () { openPanel('create'); });
  el.cancel.addEventListener('click', closePanel);

  function readPrice() {
    var n = parseFloat(String(el.price.value || '').replace(/,/g, ''));
    if (!isFinite(n) || n <= 0) return null;
    return Math.round(n * 100);
  }

  function fail(title, text) {
    el.cardAlert.innerHTML = UI.alertHtml('error', title, text || '');
  }

  el.save.addEventListener('click', function () {
    el.cardAlert.innerHTML = '';
    var title = String(el.name.value || '').trim();
    var kobo = readPrice();
    if (!title) return fail('Enter a title for the handout.');
    if (kobo === null) return fail('Enter a price above zero.', 'Type the amount in naira, for example 2500.');

    if (mode === 'create') {
      if (!el.level.value) return fail('Choose an institution, department and level.');
      if (!selected) return fail('Choose a PDF file.');

      var fd = new FormData();
      fd.append('title', title);
      fd.append('level', el.level.value);
      fd.append('price', String(kobo));
      fd.append('file', selected);

      el.save.disabled = true;
      UI.showLoader('Uploading the PDF...');
      Api.upload('/admin/extra-handouts', fd).then(
        function () {
          UI.hideLoader();
          closePanel();
          UI.toast('Handout added', 'success');
          loadList(1);
        },
        function (err) {
          UI.hideLoader();
          el.save.disabled = false;
          fail(err.message, 'Fix the problem and try again.');
        }
      );
      return;
    }

    if (mode === 'edit' && editing) {
      var changes = {};
      if (title !== editing.title) changes.title = title;
      if (kobo !== editing.price) changes.price = kobo;
      if (!Object.keys(changes).length && !selected) return fail('Nothing to save.', 'Change the title or price, or choose a new PDF.');

      el.save.disabled = true;
      UI.showLoader('Saving...');
      var base = '/admin/extra-handouts/' + editing.id;
      var step = Object.keys(changes).length ? Api.patch(base, changes) : Promise.resolve();
      step.then(function () {
        if (!selected) return null;
        var fd2 = new FormData();
        fd2.append('file', selected);
        return Api.upload(base + '/file', fd2);
      }).then(
        function () {
          UI.hideLoader();
          closePanel();
          UI.toast('Handout saved', 'success');
          loadList(state.page);
        },
        function (err) {
          UI.hideLoader();
          el.save.disabled = false;
          fail(err.message, 'Fix the problem and try again.');
          loadList(state.page);
        }
      );
    }
  });

  /* ---------- Row actions ---------- */

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var item = state.items.filter(function (x) { return x.id === id; })[0];
    if (!item) return;

    if (btn.getAttribute('data-act') === 'edit') {
      openPanel('edit', item);
      return;
    }

    // Turn off or on. This can be undone at any time, so no confirmation is needed.
    UI.showLoader('Saving...');
    Api.patch('/admin/extra-handouts/' + id, { isActive: !item.isActive }).then(
      function () {
        UI.hideLoader();
        UI.toast(item.isActive ? 'Handout turned off' : 'Handout turned on', 'success');
        loadList(state.page);
      },
      function (err) {
        UI.hideLoader();
        showAlert('error', err.message, '');
      }
    );
  });

  /* ---------- Start ---------- */

  UI.fillSelect(el.inst, [], { placeholder: 'Select institution' });
  resetDept();
  resetLevel();
  Api.get('/lookups/institutions').then(function (list) {
    UI.fillSelect(el.inst, toOptions(list), { placeholder: 'Select institution' });
  }, function (err) {
    showAlert('error', err.message, 'Reload the page to try again.');
  });
  loadList(1);
})();