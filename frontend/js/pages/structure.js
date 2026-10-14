(function () {
  'use strict';

  var PATHS = {
    institution: '/admin/institutions',
    department: '/admin/departments',
    level: '/admin/levels'
  };

  var state = { institutions: [], departments: [], levels: [], collapsed: {} };
  var treeEl = document.getElementById('tree');
  var alertEl = document.getElementById('page-alert');

  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }
  function clearAlert() { alertEl.innerHTML = ''; }

  function plural(n, word) { return n + ' ' + word + (n === 1 ? '' : 's'); }

  function findItem(type, id) {
    var list = type === 'institution' ? state.institutions : type === 'department' ? state.departments : state.levels;
    return list.filter(function (x) { return x._id === id; })[0];
  }

  /* ---------- Rendering ---------- */

  function inactiveBadge(item) { return item.isActive ? '' : ' ' + UI.badge('Inactive', 'grey'); }

  function iconBtn(act, type, id, iconName, label) {
    return '<button type="button" class="icon-btn icon-btn-sm" data-act="' + act + '" data-type="' + type +
      '" data-id="' + id + '" aria-label="' + UI.esc(label) + '" title="' + UI.esc(label) + '">' +
      UI.icon(iconName, 20) + '</button>';
  }

  function actionButtons(type, item) {
    var name = item.name;
    return iconBtn('rename', type, item._id, 'edit', 'Rename ' + name) +
      iconBtn('toggle', type, item._id, 'power', (item.isActive ? 'Deactivate ' : 'Activate ') + name) +
      iconBtn('delete', type, item._id, 'trash', 'Delete ' + name);
  }

  function levelHtml(l) {
    return '<li class="tree-level' + (l.isActive ? '' : ' inactive') + '">' +
      '<span class="tree-title">' + UI.esc(l.name) + '</span>' + inactiveBadge(l) +
      '<span class="tree-actions">' + actionButtons('level', l) + '</span></li>';
  }

  function departmentHtml(d) {
    var levels = state.levels.filter(function (l) { return l.department === d._id; });
    return '<div class="tree-dept' + (d.isActive ? '' : ' inactive') + '">' +
      '<div class="tree-row">' +
        '<div class="tree-name"><span class="tree-title">' + UI.esc(d.name) + '</span>' + inactiveBadge(d) +
        '<div class="hint">' + plural(levels.length, 'level') + '</div></div>' +
        '<div class="tree-actions">' + actionButtons('department', d) + '</div>' +
      '</div>' +
      '<ul class="tree-levels">' + levels.map(levelHtml).join('') + '</ul>' +
      '<button type="button" class="btn btn-secondary btn-small" data-act="add" data-type="level" data-parent="' + d._id + '">' +
        UI.icon('plus', 18) + 'Add level</button>' +
    '</div>';
  }

  function institutionHtml(inst) {
    var depts = state.departments.filter(function (d) { return d.institution === inst._id; });
    var open = !state.collapsed[inst._id];
    return '<section class="card tree-card' + (inst.isActive ? '' : ' inactive') + '">' +
      '<div class="tree-row">' +
        '<button type="button" class="icon-btn icon-btn-sm tree-toggle' + (open ? ' open' : '') + '" data-act="collapse" data-id="' + inst._id +
          '" aria-expanded="' + open + '" aria-label="' + (open ? 'Collapse ' : 'Expand ') + UI.esc(inst.name) + '">' + UI.icon('chevron', 20) + '</button>' +
        '<div class="tree-name"><span class="tree-title tree-title-lg">' + UI.esc(inst.name) + '</span>' + inactiveBadge(inst) +
        '<div class="hint">' + plural(depts.length, 'department') + '</div></div>' +
        '<div class="tree-actions">' + actionButtons('institution', inst) + '</div>' +
      '</div>' +
      (open
        ? '<div class="tree-children">' + depts.map(departmentHtml).join('') +
          '<button type="button" class="btn btn-secondary btn-small" data-act="add" data-type="department" data-parent="' + inst._id + '">' +
          UI.icon('plus', 18) + 'Add department</button></div>'
        : '') +
    '</section>';
  }

  function render() {
    if (!state.institutions.length) {
      treeEl.innerHTML = '<div class="card"><p class="empty-state">No institutions yet. Add one to start.</p></div>';
      return;
    }
    treeEl.innerHTML = state.institutions.map(institutionHtml).join('');
  }

  /* ---------- Data ---------- */

  function load() {
    UI.showLoader('Loading...');
    return Promise.all([
      Api.get('/admin/institutions'),
      Api.get('/admin/departments'),
      Api.get('/admin/levels')
    ]).then(
      function (r) {
        UI.hideLoader();
        state.institutions = r[0];
        state.departments = r[1];
        state.levels = r[2];
        render();
      },
      function (err) {
        UI.hideLoader();
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  }

  /* ---------- Actions ---------- */

  function openNameModal(o) {
    var item = o.mode === 'rename' ? findItem(o.type, o.id) : null;
    var m = UI.modal({
      title: (o.mode === 'add' ? 'Add ' : 'Rename ') + o.type,
      bodyHtml: '<div class="field"><label for="name-input">Name</label>' +
        '<input class="input" id="name-input" maxlength="120" autocomplete="off" value="' + UI.esc(item ? item.name : '') + '"></div>',
      actions: [
        { label: 'Cancel', kind: 'secondary', onClick: function (mm) { mm.close(); } },
        { label: o.mode === 'add' ? 'Add' : 'Save', kind: 'primary', onClick: function (mm) { submit(mm); } }
      ]
    });

    var input = m.el.querySelector('#name-input');
    input.focus();
    input.select();
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submit(m); }
    });

    function submit(mm) {
      UI.clearFieldError(input);
      var name = input.value.trim();
      if (!name) { UI.setFieldError(input, 'Enter a name.'); return; }

      var req;
      if (o.mode === 'add') {
        var body = { name: name };
        if (o.type === 'department') body.institution = o.parent;
        if (o.type === 'level') body.department = o.parent;
        req = Api.post(PATHS[o.type], body);
      } else {
        req = Api.patch(PATHS[o.type] + '/' + o.id, { name: name });
      }

      UI.showLoader('Saving...');
      req.then(
        function () {
          UI.hideLoader();
          mm.close();
          UI.toast('Saved', 'success');
          return load();
        },
        function (err) {
          UI.hideLoader();
          UI.setFieldError(input, err.message);
        }
      );
    }
  }

  function toggleActive(type, id) {
    var item = findItem(type, id);
    function go() {
      UI.showLoader('Saving...');
      return Api.patch(PATHS[type] + '/' + id, { isActive: !item.isActive }).then(
        function () {
          UI.hideLoader();
          UI.toast(item.isActive ? 'Deactivated' : 'Activated', 'success');
          return load();
        },
        function (err) { UI.hideLoader(); showAlert('error', err.message); }
      );
    }
    if (!item.isActive) { go(); return; }
    UI.confirm({
      title: 'Deactivate ' + item.name + '?',
      message: 'It will be hidden from the student drop-downs. You can activate it again at any time.',
      confirmText: 'Deactivate'
    }).then(function (yes) { if (yes) go(); });
  }

  function removeItem(type, id) {
    var item = findItem(type, id);
    UI.confirm({
      title: 'Delete ' + item.name + '?',
      message: 'This cannot be undone.',
      confirmText: 'Delete',
      danger: true
    }).then(function (yes) {
      if (!yes) return;
      UI.showLoader('Deleting...');
      Api.del(PATHS[type] + '/' + id).then(
        function () {
          UI.hideLoader();
          UI.toast('Deleted', 'success');
          return load();
        },
        function (err) {
          UI.hideLoader();
          showAlert(err.code === 'IN_USE' ? 'warning' : 'error', err.message);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      );
    });
  }

  treeEl.addEventListener('click', function (e) {
    var b = e.target.closest('button[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var type = b.getAttribute('data-type');
    var id = b.getAttribute('data-id');
    clearAlert();

    if (act === 'collapse') { state.collapsed[id] = !state.collapsed[id]; render(); return; }
    if (act === 'add') { openNameModal({ mode: 'add', type: type, parent: b.getAttribute('data-parent') }); return; }
    if (act === 'rename') { openNameModal({ mode: 'rename', type: type, id: id }); return; }
    if (act === 'toggle') { toggleActive(type, id); return; }
    if (act === 'delete') { removeItem(type, id); }
  });

  document.getElementById('add-institution').addEventListener('click', function () {
    clearAlert();
    openNameModal({ mode: 'add', type: 'institution' });
  });

  Auth.init({ page: 'structure', roles: ['superadmin'] }).then(load);
})();