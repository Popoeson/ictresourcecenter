// Admin session guard, shell (top bar and slide-in menu) and role-based menu
(function (global) {
  'use strict';

  var ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin' };
  var BOTH = ['admin', 'superadmin'];
  var SUPER = ['superadmin'];

  // ready: false shows the item greyed with a "Soon" tag. Set it to true when the page is built.
  var MENU = [
    { key: 'dashboard', label: 'Overview', icon: 'grid', href: '/admin/dashboard.html', roles: BOTH, ready: true },
        { key: 'students', label: 'Students', icon: 'users', href: '/admin/students.html', roles: BOTH, ready: true },
    { key: 'submissions', label: 'Submissions', icon: 'file', href: '/admin/submissions.html', roles: BOTH, ready: false },
        { key: 'payments', label: 'Payments', icon: 'card', href: '/admin/payments.html', roles: BOTH, ready: true },
    { key: 'handouts', label: 'Handout orders', icon: 'book', href: '/admin/handouts.html', roles: BOTH, ready: false },
    { key: 'reports', label: 'Reports', icon: 'chart', href: '/admin/reports.html', roles: BOTH, ready: false },
        { key: 'import', label: 'Imports', icon: 'upload', href: '/admin/import.html', roles: SUPER, ready: true },
        { key: 'structure', label: 'Structure', icon: 'layers', href: '/admin/structure.html', roles: SUPER, ready: true },
        { key: 'prices', label: 'Prices', icon: 'tag', href: '/admin/prices.html', roles: SUPER, ready: true },
    { key: 'handout-settings', label: 'Handout settings', icon: 'sliders', href: '/admin/handout-settings.html', roles: SUPER, ready: true },
    { key: 'tokens', label: 'Tokens', icon: 'key', href: '/admin/tokens.html', roles: SUPER, ready: true },
        { key: 'admins', label: 'Admins', icon: 'shield', href: '/admin/admins.html', roles: SUPER, ready: true },
    { key: 'audit', label: 'Audit log', icon: 'clipboard', href: '/admin/audit.html', roles: SUPER, ready: false },
    { key: 'password', label: 'Change password', icon: 'lock', href: '/admin/change-password.html', roles: BOTH, ready: true }
  ];

  var TITLES = ['dr', 'prof', 'mr', 'mrs', 'ms', 'miss', 'engr', 'rev', 'chief', 'sir'];

  function firstName(full) {
    var parts = String(full || '').trim().split(/\s+/).filter(Boolean);
    while (parts.length > 1 && TITLES.indexOf(parts[0].toLowerCase().replace(/\./g, '')) !== -1) parts.shift();
    return parts[0] || '';
  }

  function greeting() {
    var h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  }

  function logout() {
    function go() { location.href = '/admin/login.html'; }
    return Api.post('/auth/logout', {}, { noRedirect: true }).then(go, go);
  }

  function mountShell(admin, opts) {
    var content = document.getElementById('page-content');

    var nav = MENU.filter(function (m) { return m.roles.indexOf(admin.role) !== -1; }).map(function (m) {
      var label = UI.esc(m.label);
      if (!m.ready) {
        return '<span class="shell-link soon" aria-disabled="true">' + UI.icon(m.icon) +
          '<span>' + label + '</span><span class="shell-soon-tag">Soon</span></span>';
      }
      var current = m.key === opts.page;
      return '<a class="shell-link' + (current ? ' active' : '') + '" href="' + m.href + '"' +
        (current ? ' aria-current="page"' : '') + '>' + UI.icon(m.icon) + '<span>' + label + '</span></a>';
    }).join('');

    var shell = document.createElement('div');
    shell.innerHTML =
      '<header class="shell-topbar">' +
        '<button type="button" class="icon-btn" id="shell-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="shell-drawer">' + UI.icon('menu') + '</button>' +
        '<span class="shell-title">ICT Admin</span>' +
        '<span class="shell-spacer"></span>' +
        '<span class="shell-user">' + UI.esc(admin.name) + '</span>' +
        '<span class="role-pill">' + UI.esc(ROLE_LABEL[admin.role] || admin.role) + '</span>' +
        '<button type="button" class="icon-btn" id="shell-logout" aria-label="Log out">' + UI.icon('logout') + '<span class="shell-logout-text">Log out</span></button>' +
      '</header>' +
      '<div class="shell-backdrop" id="shell-backdrop"></div>' +
      '<aside class="shell-drawer" id="shell-drawer" aria-label="Main menu">' +
        '<div class="shell-drawer-head">' +
          '<div><div class="shell-drawer-title">ICT Course Portal</div><div class="shell-drawer-sub">Admin</div></div>' +
          '<button type="button" class="icon-btn" id="shell-close" aria-label="Close menu">' + UI.icon('close') + '</button>' +
        '</div>' +
        '<nav class="shell-nav">' + nav + '</nav>' +
        '<div class="shell-foot"><a class="shell-link" href="/" target="_blank" rel="noopener">' + UI.icon('external') + '<span>View student site</span></a></div>' +
      '</aside>' +
      '<main class="shell-main" id="shell-main"></main>';

    while (shell.firstChild) document.body.insertBefore(shell.firstChild, content);
    document.getElementById('shell-main').appendChild(content);
    content.classList.remove('hidden');

    var menuBtn = document.getElementById('shell-menu-btn');
    var drawer = document.getElementById('shell-drawer');
    var backdrop = document.getElementById('shell-backdrop');
    var closeBtn = document.getElementById('shell-close');

    function onKey(e) { if (e.key === 'Escape') closeMenu(); }
    function openMenu() {
      drawer.classList.add('open');
      backdrop.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');
      document.addEventListener('keydown', onKey);
      closeBtn.focus();
    }
    function closeMenu() {
      drawer.classList.remove('open');
      backdrop.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', onKey);
      menuBtn.focus();
    }

    menuBtn.addEventListener('click', openMenu);
    closeBtn.addEventListener('click', closeMenu);
    backdrop.addEventListener('click', closeMenu);
    document.getElementById('shell-logout').addEventListener('click', logout);
  }

  // opts: { page, roles, shell (default true), allowMustChange }
  // Resolves with the admin. If the user is being redirected, the promise never resolves.
  function init(opts) {
    opts = opts || {};
    var halt = function () { return new Promise(function () {}); };
    UI.showLoader('Loading...');

    return Api.get('/auth/me').then(
      function (admin) {
        UI.hideLoader();
        if (admin.mustChangePassword && !opts.allowMustChange) {
          location.replace('/admin/change-password.html');
          return halt();
        }
        if (opts.shell !== false) mountShell(admin, opts);
        if (opts.roles && opts.roles.indexOf(admin.role) === -1) {
          document.getElementById('page-content').innerHTML =
            UI.alertHtml('warning', 'You have view-only access.', 'This page is only for the Super Admin.');
          return halt();
        }
        return admin;
      },
      function (err) {
        UI.hideLoader();
        if (err.code === 'UNAUTHENTICATED') return halt();
        var c = document.getElementById('page-content');
        if (c) {
          c.innerHTML = UI.alertHtml('error', err.message, 'Reload the page to try again.');
          c.classList.remove('hidden');
        }
        return halt();
      }
    );
  }

  global.Auth = { init: init, logout: logout, firstName: firstName, greeting: greeting, MENU: MENU };
})(window);