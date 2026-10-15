(function () {
  'use strict';

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var MIN_PASSWORD = 10;

  function $(id) { return document.getElementById(id); }

  var alertEl = $('page-alert');
  var statusEl = $('admins-status');
  var wrap = $('admins-wrap');
  var body = $('admins-body');
  var items = {};

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  /* ---------- List ---------- */

  function statusCell(a) {
    if (a.role === 'superadmin') return UI.badge('Super Admin', 'tan');
    var html = a.isActive ? UI.badge('Active', 'green') : UI.badge('Inactive', 'grey');
    if (a.isActive && a.mustChangePassword) html += ' ' + UI.badge('Temporary password', 'amber');
    return html;
  }

  function actionsCell(a) {
    if (a.role !== 'admin') return '<td class="cell-actions" data-label="Actions"><span class="muted">\u2014</span></td>';
    var id = UI.esc(a.id);
    var name = UI.esc(a.name);
    return '<td class="cell-actions" data-label="Actions"><div class="btn-row">' +
      '<button type="button" class="btn btn-secondary btn-small" data-act="reset" data-id="' + id + '" aria-label="Reset password for ' + name + '">Reset password</button>' +
      (a.isActive
        ? '<button type="button" class="btn btn-danger btn-small" data-act="toggle" data-id="' + id + '" aria-label="Deactivate ' + name + '">Deactivate</button>'
        : '<button type="button" class="btn btn-secondary btn-small" data-act="toggle" data-id="' + id + '" aria-label="Activate ' + name + '">Activate</button>') +
      '</div></td>';
  }

  function rowHtml(a) {
    return '<tr>' +
      '<td data-label="Name"><span class="student-name">' + UI.esc(a.name) + '</span></td>' +
      '<td data-label="Email">' + UI.esc(a.email) + '</td>' +
      '<td data-label="Status">' + statusCell(a) + '</td>' +
      '<td data-label="Last login">' + (a.lastLoginAt ? UI.esc(UI.fmtDate(a.lastLoginAt)) : '<span class="muted">Never</span>') + '</td>' +
      actionsCell(a) + '</tr>';
  }

  function load() {
    statusEl.textContent = 'Loading admins...';
    return Api.get('/admin/admins').then(
      function (list) {
        statusEl.textContent = '';
        items = {};
        list.forEach(function (a) { items[a.id] = a; });
        body.innerHTML = list.map(rowHtml).join('');
        wrap.classList.remove('hidden');
        var hasAdmins = list.some(function (a) { return a.role === 'admin'; });
        if (!hasAdmins) {
          showAlert('info', 'No admins yet.', 'Add one to give someone view-only access.');
        }
      },
      function (err) {
        statusEl.textContent = '';
        wrap.classList.add('hidden');
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  }

  /* ---------- Add admin ---------- */

  function passwordField(id, label) {
    return '<div class="field"><label for="' + id + '">' + label + '</label>' +
      '<div class="password-wrap"><input class="input" id="' + id + '" type="password" autocomplete="new-password">' +
      '<button type="button" class="password-toggle" aria-label="Show password"></button></div>' +
      '<p class="hint">At least ' + MIN_PASSWORD + ' characters. Share it with the admin. They must change it when they first log in.</p></div>';
  }

  function openAdd() {
    var m = UI.modal({
      title: 'Add admin',
      bodyHtml: '<div id="mf-alert" aria-live="polite"></div>' +
        '<div class="field"><label for="af-name">Name</label><input class="input" id="af-name" autocomplete="off"></div>' +
        '<div class="field"><label for="af-email">Email</label><input class="input" id="af-email" type="email" autocomplete="off"></div>' +
        passwordField('af-pass', 'Temporary password'),
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: function (mm) { mm.close(); } },
        { label: 'Add admin', kind: 'primary', onClick: function (mm) { submitAdd(mm); } }
      ]
    });
    UI.bindPasswordToggles(m.el);
  }

  function submitAdd(m) {
    var root = m.el;
    var btn = root.querySelectorAll('.modal-actions button')[1];
    var box = root.querySelector('#mf-alert');
    var name = root.querySelector('#af-name');
    var email = root.querySelector('#af-email');
    var pass = root.querySelector('#af-pass');
    [name, email, pass].forEach(UI.clearFieldError);
    box.innerHTML = '';

    var ok = true;
    function bad(input, msg) { if (ok) input.focus(); UI.setFieldError(input, msg); ok = false; }

    var n = name.value.trim();
    var e = email.value.trim();
    if (!n) bad(name, 'Enter a name.');
    if (!e) bad(email, 'Enter an email.');
    else if (!EMAIL_RE.test(e)) bad(email, 'Enter a valid email.');
    if (pass.value.length < MIN_PASSWORD) bad(pass, 'Use at least ' + MIN_PASSWORD + ' characters.');
    if (!ok) return;

    btn.disabled = true;
    btn.textContent = 'Adding...';
    Api.post('/admin/admins', { name: n, email: e, temporaryPassword: pass.value }).then(
      function () {
        m.close();
        UI.toast('Admin added', 'success');
        clearAlert();
        load();
      },
      function (err) {
        btn.disabled = false;
        btn.textContent = 'Add admin';
        box.innerHTML = UI.alertHtml('error', err.message, '');
      }
    );
  }

  /* ---------- Reset password ---------- */

  function openReset(a) {
    var m = UI.modal({
      title: 'Reset password',
      bodyHtml: '<div id="mf-alert" aria-live="polite"></div>' +
        '<p>Set a new temporary password for <strong>' + UI.esc(a.name) + '</strong>. ' +
        'They must change it at their next login. This also clears any lock on the account.</p>' +
        passwordField('rf-pass', 'New temporary password'),
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: function (mm) { mm.close(); } },
        { label: 'Reset password', kind: 'primary', onClick: function (mm) { submitReset(mm, a); } }
      ]
    });
    UI.bindPasswordToggles(m.el);
  }

  function submitReset(m, a) {
    var root = m.el;
    var btn = root.querySelectorAll('.modal-actions button')[1];
    var box = root.querySelector('#mf-alert');
    var pass = root.querySelector('#rf-pass');
    UI.clearFieldError(pass);
    box.innerHTML = '';
    if (pass.value.length < MIN_PASSWORD) {
      pass.focus();
      UI.setFieldError(pass, 'Use at least ' + MIN_PASSWORD + ' characters.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';
    Api.post('/admin/admins/' + encodeURIComponent(a.id) + '/reset-password', { temporaryPassword: pass.value }).then(
      function () {
        m.close();
        UI.toast('Password reset', 'success');
        load();
      },
      function (err) {
        btn.disabled = false;
        btn.textContent = 'Reset password';
        box.innerHTML = UI.alertHtml('error', err.message, '');
      }
    );
  }

  /* ---------- Deactivate / activate ---------- */

  function toggleActive(a) {
    var deactivating = a.isActive;
    UI.confirm({
      title: deactivating ? 'Deactivate admin?' : 'Activate admin?',
      message: deactivating
        ? a.name + ' will be logged out and will not be able to log in. Their account is kept and can be activated again.'
        : a.name + ' will be able to log in again.',
      confirmText: deactivating ? 'Deactivate' : 'Activate',
      danger: deactivating
    }).then(function (yes) {
      if (!yes) return;
      UI.showLoader(deactivating ? 'Deactivating...' : 'Activating...');
      Api.patch('/admin/admins/' + encodeURIComponent(a.id), { isActive: !deactivating }).then(
        function () {
          UI.hideLoader();
          UI.toast(deactivating ? 'Admin deactivated' : 'Admin activated', 'success');
          clearAlert();
          load();
        },
        function (err) {
          UI.hideLoader();
          showAlert('error', err.message, '');
        }
      );
    });
  }

  body.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-act]');
    if (!btn) return;
    var a = items[btn.getAttribute('data-id')];
    if (!a) return;
    if (btn.getAttribute('data-act') === 'reset') openReset(a);
    else toggleActive(a);
  });

  $('add-admin').addEventListener('click', openAdd);

  Auth.init({ page: 'admins', roles: ['superadmin'] }).then(function () {
    $('add-admin').innerHTML = UI.icon('plus', 20) + '<span>Add admin</span>';
    load();
  });
})();