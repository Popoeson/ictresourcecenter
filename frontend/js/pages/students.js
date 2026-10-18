(function () {
  'use strict';

  var PAGE_SIZE = 25;
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function $(id) { return document.getElementById(id); }
  function idOf(o) { return o ? (o.id || o._id || '') : ''; }
  function toOptions(list) {
    return (list || []).map(function (x) { return { id: idOf(x), name: x.name }; });
  }
  function fullName(s) {
    return [s.surname, s.firstname, s.othername].filter(Boolean).join(' ');
  }
  function dash(v) { return v ? UI.esc(v) : '<span class="muted">\u2014</span>'; }

  var isSuper = false;
  var institutions = [];
  var items = {};
  var state = { page: 1, totalPages: 1, total: 0 };
  var requestId = 0;
  var searchTimer = null;

  var alertEl = $('page-alert');
  var el = {
    q: $('f-q'), inst: $('f-inst'), dept: $('f-dept'), level: $('f-level'), fee: $('f-fee'),
    clear: $('f-clear'), count: $('students-count'), empty: $('students-empty'),
    wrap: $('students-wrap'), body: $('students-body'), pager: $('pager'),
    prev: $('pager-prev'), next: $('pager-next'), info: $('pager-info'), add: $('add-student')
  };

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  /* ---------- Lookups ---------- */

  function loadDepartments(instId) {
    if (!instId) return Promise.resolve([]);
    return Api.get('/lookups/departments', { institution: instId }).then(toOptions);
  }

  function loadLevels(deptId) {
    if (!deptId) return Promise.resolve([]);
    return Api.get('/lookups/levels', { department: deptId }).then(toOptions);
  }

  function resetSelect(select, placeholder) {
    UI.fillSelect(select, [], { placeholder: placeholder });
    select.disabled = true;
  }

  function ensureOption(select, id, name) {
    if (!id) return;
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === id) return;
    }
    var o = document.createElement('option');
    o.value = id;
    o.textContent = name || 'Current';
    select.appendChild(o);
  }

  /* ---------- List ---------- */

  function filtersActive() {
    return !!(el.q.value.trim() || el.inst.value || el.dept.value || el.level.value || el.fee.value);
  }

  function rowHtml(s) {
    var id = UI.esc(idOf(s));
    var name = fullName(s);
    var actions = '';
    if (isSuper) {
      actions = '<td class="cell-actions" data-label="Actions">' +
        '<button type="button" class="icon-btn icon-btn-sm" data-act="edit" data-id="' + id + '" aria-label="Edit ' + UI.esc(name) + '">' + UI.icon('edit', 20) + '</button>' +
        '<button type="button" class="icon-btn icon-btn-sm" data-act="delete" data-id="' + id + '" aria-label="Delete ' + UI.esc(name) + '">' + UI.icon('trash', 20) + '</button>' +
        '</td>';
    }
    return '<tr>' +
      '<td data-label="Name"><span class="student-name">' + UI.esc(name) + '</span></td>' +
      '<td data-label="Institution">' + dash(s.institution && s.institution.name) + '</td>' +
      '<td data-label="Department">' + dash(s.department && s.department.name) + '</td>' +
      '<td data-label="Level">' + dash(s.level && s.level.name) + '</td>' +
      '<td data-label="Phone">' + dash(s.phone) + '</td>' +
      '<td data-label="Email">' + dash(s.email) + '</td>' +
      '<td data-label="ICT fee">' + (s.ictFeePaid ? UI.badge('Paid', 'green') : UI.badge('Not paid', 'grey')) + '</td>' +
      actions + '</tr>';
  }

  function showEmpty(html) {
    el.empty.innerHTML = '<p class="empty-state">' + html + '</p>';
    el.empty.classList.remove('hidden');
    el.wrap.classList.add('hidden');
    el.pager.classList.add('hidden');
  }

  function render(data) {
    var page = Number(data.page) || 1;
    if (!data.items.length && page > 1) { loadList(page - 1); return; }

    items = {};
    data.items.forEach(function (s) { items[idOf(s)] = s; });
    state.page = page;
    state.totalPages = Number(data.totalPages) || 1;
    state.total = Number(data.total) || 0;

    if (!data.items.length) {
      el.count.textContent = '';
      if (filtersActive()) showEmpty('No students match your filters.');
      else showEmpty(isSuper
        ? 'No students yet. Add one, or import the Google Form file.'
        : 'No students yet.');
      return;
    }

    el.empty.classList.add('hidden');
    el.wrap.classList.remove('hidden');
    el.body.innerHTML = data.items.map(rowHtml).join('');

    var from = (state.page - 1) * PAGE_SIZE + 1;
    var to = from + data.items.length - 1;
    el.count.textContent = 'Showing ' + from + '\u2013' + to + ' of ' + state.total + ' student' + (state.total === 1 ? '' : 's');

    el.pager.classList.toggle('hidden', state.totalPages <= 1);
    el.info.textContent = 'Page ' + state.page + ' of ' + state.totalPages;
    el.prev.disabled = state.page <= 1;
    el.next.disabled = state.page >= state.totalPages;
  }

  function loadList(page) {
    var id = ++requestId;
    clearAlert();
    el.count.textContent = 'Loading students...';
    Api.get('/admin/students', {
      page: page || 1,
      limit: PAGE_SIZE,
      q: el.q.value.trim(),
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      ictFeePaid: el.fee.value
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

  /* ---------- Filters ---------- */

  el.q.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { loadList(1); }, 300);
  });
  el.fee.addEventListener('change', function () { loadList(1); });

  el.inst.addEventListener('change', function () {
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    if (!el.inst.value) { loadList(1); return; }
    loadDepartments(el.inst.value).then(function (opts) {
      UI.fillSelect(el.dept, opts, { placeholder: 'All departments' });
      el.dept.disabled = false;
    }, function (err) { showAlert('error', err.message, ''); });
    loadList(1);
  });

  el.dept.addEventListener('change', function () {
    resetSelect(el.level, 'All levels');
    if (!el.dept.value) { loadList(1); return; }
    loadLevels(el.dept.value).then(function (opts) {
      UI.fillSelect(el.level, opts, { placeholder: 'All levels' });
      el.level.disabled = false;
    }, function (err) { showAlert('error', err.message, ''); });
    loadList(1);
  });

  el.level.addEventListener('change', function () { loadList(1); });

  el.clear.addEventListener('click', function () {
    el.q.value = '';
    el.inst.value = '';
    el.fee.value = '';
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadList(1);
  });

  el.prev.addEventListener('click', function () { loadList(state.page - 1); });
  el.next.addEventListener('click', function () { loadList(state.page + 1); });

  /* ---------- Add and edit ---------- */

  function formHtml() {
    return '<div id="sf-alert" aria-live="polite"></div>' +
      '<div class="field"><label for="sf-surname">Surname</label><input class="input" id="sf-surname" autocomplete="off"></div>' +
      '<div class="field"><label for="sf-firstname">First name</label><input class="input" id="sf-firstname" autocomplete="off"></div>' +
      '<div class="field"><label for="sf-othername">Other name (optional)</label><input class="input" id="sf-othername" autocomplete="off"></div>' +
      '<div class="field"><label for="sf-phone">Phone</label><input class="input" id="sf-phone" type="tel" inputmode="tel" autocomplete="off"></div>' +
      '<div class="field"><label for="sf-email">Email</label><input class="input" id="sf-email" type="email" autocomplete="off">' +
      '<p class="hint">Enter an email or a phone number.</p></div>' +
      '<div class="field"><label for="sf-inst">Institution</label><select class="select" id="sf-inst"></select></div>' +
      '<div class="field"><label for="sf-dept">Department</label><select class="select" id="sf-dept" disabled></select></div>' +
      '<div class="field"><label for="sf-level">Level</label><select class="select" id="sf-level" disabled></select></div>';
  }

  function openForm(student) {
    var editing = !!student;
    var original = { level: '' };

    var m = UI.modal({
      title: editing ? 'Edit student' : 'Add student',
      bodyHtml: formHtml(),
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: function (mm) { mm.close(); } },
        { label: editing ? 'Save changes' : 'Add student', kind: 'primary', onClick: function (mm) { submit(mm, student, original); } }
      ]
    });

    var root = m.el;
    var saveBtn = root.querySelectorAll('.modal-actions button')[1];
    var f = {
      surname: root.querySelector('#sf-surname'), firstname: root.querySelector('#sf-firstname'),
      othername: root.querySelector('#sf-othername'), phone: root.querySelector('#sf-phone'),
      email: root.querySelector('#sf-email'), inst: root.querySelector('#sf-inst'),
      dept: root.querySelector('#sf-dept'), level: root.querySelector('#sf-level')
    };

    UI.fillSelect(f.inst, institutions, { placeholder: 'Select institution' });
    UI.fillSelect(f.dept, [], { placeholder: 'Select department' });
    UI.fillSelect(f.level, [], { placeholder: 'Select level' });

    f.inst.addEventListener('change', function () {
      resetSelect(f.dept, 'Select department');
      resetSelect(f.level, 'Select level');
      if (!f.inst.value) return;
      loadDepartments(f.inst.value).then(function (opts) {
        UI.fillSelect(f.dept, opts, { placeholder: 'Select department' });
        f.dept.disabled = false;
      }, function (err) { UI.setFieldError(f.dept, err.message); });
    });

    f.dept.addEventListener('change', function () {
      resetSelect(f.level, 'Select level');
      if (!f.dept.value) return;
      loadLevels(f.dept.value).then(function (opts) {
        UI.fillSelect(f.level, opts, { placeholder: 'Select level' });
        f.level.disabled = false;
      }, function (err) { UI.setFieldError(f.level, err.message); });
    });

    if (!editing) return;

    f.surname.value = student.surname || '';
    f.firstname.value = student.firstname || '';
    f.othername.value = student.othername || '';
    f.phone.value = student.phone || '';
    f.email.value = student.email || '';

    var iId = idOf(student.institution);
    var dId = idOf(student.department);
    var lId = idOf(student.level);
    original.level = lId;

    saveBtn.disabled = true;
    ensureOption(f.inst, iId, student.institution && student.institution.name);
    f.inst.value = iId;
    loadDepartments(iId).then(function (opts) {
      UI.fillSelect(f.dept, opts, { placeholder: 'Select department' });
      ensureOption(f.dept, dId, student.department && student.department.name);
      f.dept.value = dId;
      f.dept.disabled = false;
      return loadLevels(dId);
    }).then(function (opts) {
      UI.fillSelect(f.level, opts, { placeholder: 'Select level' });
      ensureOption(f.level, lId, student.level && student.level.name);
      f.level.value = lId;
      f.level.disabled = false;
      saveBtn.disabled = false;
    }).catch(function (err) {
      root.querySelector('#sf-alert').innerHTML = UI.alertHtml('error', err.message, 'Close this window and try again.');
    });
  }

  function submit(m, student, original) {
    var root = m.el;
    var saveBtn = root.querySelectorAll('.modal-actions button')[1];
    var alertBox = root.querySelector('#sf-alert');
    var f = {
      surname: root.querySelector('#sf-surname'), firstname: root.querySelector('#sf-firstname'),
      othername: root.querySelector('#sf-othername'), phone: root.querySelector('#sf-phone'),
      email: root.querySelector('#sf-email'), inst: root.querySelector('#sf-inst'),
      dept: root.querySelector('#sf-dept'), level: root.querySelector('#sf-level')
    };
    Object.keys(f).forEach(function (k) { UI.clearFieldError(f[k]); });
    alertBox.innerHTML = '';

    var v = {
      surname: f.surname.value.trim(), firstname: f.firstname.value.trim(),
      othername: f.othername.value.trim(), phone: f.phone.value.trim(), email: f.email.value.trim()
    };

    var ok = true;
    function bad(input, msg) { if (ok) input.focus(); UI.setFieldError(input, msg); ok = false; }

    if (!v.surname) bad(f.surname, 'Enter the surname.');
    if (!v.firstname) bad(f.firstname, 'Enter the first name.');
    if (!v.email && !v.phone) bad(f.email, 'Enter an email or a phone number.');
    else if (v.email && !EMAIL_RE.test(v.email)) bad(f.email, 'Email is not valid.');
    if (!f.inst.value) bad(f.inst, 'Select an institution.');
    else if (!f.dept.value) bad(f.dept, 'Select a department.');
    else if (!f.level.value) bad(f.level, 'Select a level.');
    if (!ok) return;

    var payload;
    if (student) {
      payload = v;
      if (f.level.value !== original.level) payload.level = f.level.value;
    } else {
      payload = { surname: v.surname, firstname: v.firstname, level: f.level.value };
      if (v.othername) payload.othername = v.othername;
      if (v.phone) payload.phone = v.phone;
      if (v.email) payload.email = v.email;
    }

    saveBtn.disabled = true;
    var label = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';

    var req = student
      ? Api.patch('/admin/students/' + idOf(student), payload)
      : Api.post('/admin/students', payload);

    req.then(
      function () {
        m.close();
        UI.toast(student ? 'Student updated' : 'Student added', 'success');
        loadList(student ? state.page : 1);
      },
      function (err) {
        saveBtn.disabled = false;
        saveBtn.textContent = label;
        alertBox.innerHTML = UI.alertHtml('error', err.message, '');
      }
    );
  }

  /* ---------- Delete ---------- */

  function deleteStudent(s) {
    UI.confirm({
      title: 'Delete student?',
      message: fullName(s) + ' will be removed from the student list. Payment and submission history is kept.',
      confirmText: 'Delete',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      UI.showLoader('Deleting...');
      Api.del('/admin/students/' + idOf(s)).then(
        function () {
          UI.hideLoader();
          UI.toast('Student deleted', 'success');
          loadList(state.page);
        },
        function (err) {
          UI.hideLoader();
          showAlert('error', err.message, '');
        }
      );
    });
  }

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var s = items[btn.getAttribute('data-id')];
    if (!s) return;
    if (btn.getAttribute('data-act') === 'edit') openForm(s);
    else deleteStudent(s);
  });

  el.add.addEventListener('click', function () { openForm(null); });

  /* ---------- Export ---------- */

  $('export-btn').addEventListener('click', function () {
    if (el.from.value && el.to.value && el.from.value > el.to.value) {
      showAlert('warning', 'The "From" date is after the "To" date.', 'Change one of them.');
      return;
    }
    var btn = $('export-btn');
    clearAlert();
    btn.disabled = true;
    UI.showLoader('Preparing your download...');
    Api.download('/admin/export/payments', {
      q: el.q.value.trim(),
      type: el.type.value,
      status: el.status.value,
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      from: el.from.value,
      to: el.to.value
    }).then(
      function () { UI.hideLoader(); btn.disabled = false; UI.toast('Export downloaded', 'success'); },
      function (err) {
        UI.hideLoader();
        btn.disabled = false;
        showAlert(err.status === 400 || err.status === 404 ? 'warning' : 'error', err.message, '');
      }
    );
  });

  /* ---------- Export ---------- */

  $('export-btn').addEventListener('click', function () {
    var btn = $('export-btn');
    clearAlert();
    btn.disabled = true;
    UI.showLoader('Preparing your download...');
    Api.download('/admin/export/students', {
      q: el.q.value.trim(),
      institution: el.inst.value,
      department: el.dept.value,
      level: el.level.value,
      ictFeePaid: el.fee.value
    }).then(
      function () { UI.hideLoader(); btn.disabled = false; UI.toast('Export downloaded', 'success'); },
      function (err) {
        UI.hideLoader();
        btn.disabled = false;
        showAlert(err.status === 400 || err.status === 404 ? 'warning' : 'error', err.message, '');
      }
    );
  });

  /* ---------- Start ---------- */
  Auth.init({ page: 'students' }).then(function (admin) {
    isSuper = admin.role === 'superadmin';
    if (isSuper) {
      el.add.innerHTML = UI.icon('plus', 20) + '<span>Add student</span>';
      el.add.classList.remove('hidden');
      $('th-actions').hidden = false;
    } else {
      $('page-sub').textContent = 'Everyone who offers the course. You have view-only access.';
    }

    Api.get('/lookups/institutions').then(function (list) {
      institutions = toOptions(list);
      UI.fillSelect(el.inst, institutions, { placeholder: 'All institutions' });
    }, function (err) {
      showAlert('error', err.message, 'Filters may be missing. Reload the page to try again.');
    });
    resetSelect(el.dept, 'All departments');
    resetSelect(el.level, 'All levels');
    loadList(1);
  });
})();