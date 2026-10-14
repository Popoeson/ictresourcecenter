(function () {
  'use strict';

  document.getElementById('year').textContent = new Date().getFullYear();
  UI.bindPasswordToggles();

  var form = document.getElementById('login-form');
  var email = document.getElementById('email');
  var password = document.getElementById('password');
  var btn = document.getElementById('login-btn');
  var alertBox = document.getElementById('form-alert');

  // Already logged in? Go straight in.
  Api.get('/auth/me', null, { noRedirect: true }).then(function (admin) {
    location.replace(admin.mustChangePassword ? '/admin/change-password.html' : '/admin/dashboard.html');
  }, function () {});

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    alertBox.innerHTML = '';
    UI.clearFieldError(email);
    UI.clearFieldError(password);

    var ok = true;
    if (!email.value.trim()) { UI.setFieldError(email, 'Enter your staff email address.'); ok = false; }
    if (!password.value) { UI.setFieldError(password, 'Enter your password.'); ok = false; }
    if (!ok) return;

    btn.disabled = true;
    UI.showLoader('Logging you in...');

    Api.post('/auth/login', { email: email.value.trim(), password: password.value }, { noRedirect: true }).then(
      function (admin) {
        location.href = admin.mustChangePassword ? '/admin/change-password.html' : '/admin/dashboard.html';
      },
      function (err) {
        UI.hideLoader();
        btn.disabled = false;
        var hint = err.code === 'INVALID_CREDENTIALS' ? 'Check your details and try again.' : '';
        alertBox.innerHTML = UI.alertHtml('error', err.message, hint);
      }
    );
  });
})();