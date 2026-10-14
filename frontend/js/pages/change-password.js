(function () {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();
  UI.bindPasswordToggles();

  var form = document.getElementById('cp-form');
  var cur = document.getElementById('cur');
  var nw = document.getElementById('nw');
  var cf = document.getElementById('cf');
  var btn = document.getElementById('cp-btn');
  var alertBox = document.getElementById('form-alert');
  var forced = false;

  Auth.init({ shell: false, allowMustChange: true }).then(function (admin) {
    forced = !!admin.mustChangePassword;
    document.getElementById('cp-title').textContent = forced ? 'Set a new password' : 'Change password';
    document.getElementById('cp-lead').textContent = forced
      ? 'You are using a temporary password. Choose a new one to continue.'
      : 'Choose a new password for your account.';
    document.getElementById(forced ? 'cp-logout' : 'cp-back').classList.remove('hidden');
    document.getElementById('page-content').classList.remove('hidden');
  });

  document.getElementById('cp-logout').addEventListener('click', function () { Auth.logout(); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    alertBox.innerHTML = '';
    [cur, nw, cf].forEach(UI.clearFieldError);

    var ok = true;
    if (!cur.value) { UI.setFieldError(cur, 'Enter your current password.'); ok = false; }
    if (nw.value.length < 10) { UI.setFieldError(nw, 'Use at least 10 characters.'); ok = false; }
    else if (nw.value === cur.value) { UI.setFieldError(nw, 'Choose a password that is different from the current one.'); ok = false; }
    if (cf.value !== nw.value) { UI.setFieldError(cf, 'The passwords do not match.'); ok = false; }
    if (!ok) return;

    btn.disabled = true;
    UI.showLoader('Saving your password...');

    Api.post('/auth/change-password', { currentPassword: cur.value, newPassword: nw.value }).then(
      function () {
        if (forced) { location.href = '/admin/dashboard.html'; return; }
        UI.hideLoader();
        btn.disabled = false;
        form.reset();
        alertBox.innerHTML = UI.alertHtml('success', 'Password updated.', 'Use your new password the next time you log in.');
      },
      function (err) {
        UI.hideLoader();
        btn.disabled = false;
        if (err.code === 'WRONG_PASSWORD') UI.setFieldError(cur, err.message);
        else if (err.code === 'SAME_PASSWORD' || err.code === 'VALIDATION_ERROR') UI.setFieldError(nw, err.message);
        else alertBox.innerHTML = UI.alertHtml('error', err.message);
      }
    );
  });
})();