(function () {
  'use strict';

  Auth.init({ page: 'dashboard' }).then(function (admin) {
    var name = Auth.firstName(admin.name);
    document.getElementById('greeting').textContent = Auth.greeting() + (name ? ', ' + name : '');
  });
})();