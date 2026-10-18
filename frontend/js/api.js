// Fetch wrapper: same-origin /api, consistent errors, admin session redirects
(function (global) {
  'use strict';

  function makeError(message, status, code) {
    var e = new Error(message);
    e.status = status;
    e.code = code;
    return e;
  }

  function qs(params) {
    if (!params) return '';
    var parts = [];
    Object.keys(params).forEach(function (k) {
      var v = params[k];
      if (v === undefined || v === null || v === '') return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  // Only admin pages are redirected. Public pages handle errors themselves.
  function handleAuthRedirect(err, opts) {
    if (opts && opts.noRedirect) return;
    var path = location.pathname;
    if (path.indexOf('/admin/') !== 0) return;
    if (err.code === 'UNAUTHENTICATED' && path.indexOf('/admin/login') !== 0) {
      location.href = '/admin/login.html';
    }
    if (err.code === 'PASSWORD_CHANGE_REQUIRED' && path.indexOf('/admin/change-password') !== 0) {
      location.href = '/admin/change-password.html';
    }
  }

  function request(method, path, body, opts) {
    var init = { method: method, headers: {}, credentials: 'same-origin' };
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined && body !== null) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }

    return fetch('/api' + path, init).then(
      function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.ok && data.success !== false) return data.data;
          var err = makeError(
            data.message || 'Something went wrong. Please try again.',
            res.status,
            data.code || 'ERROR'
          );
          handleAuthRedirect(err, opts);
          throw err;
        });
      },
      function () {
        throw makeError('Could not reach the server. Check your connection and try again.', 0, 'NETWORK');
      }
    );
  }

  global.Api = {
    get: function (path, params, opts) { return request('GET', path + qs(params), undefined, opts); },
    post: function (path, body, opts) { return request('POST', path, body === undefined ? {} : body, opts); },
    put: function (path, body, opts) { return request('PUT', path, body, opts); },
    patch: function (path, body, opts) { return request('PATCH', path, body, opts); },
    del: function (path, opts) { return request('DELETE', path, undefined, opts); },
        upload: function (path, formData, opts) { return request('POST', path, formData, opts); },
    // Downloads a file. Errors come back as normal errors, so the page can show a message.
    download: function (path, params, opts) {
      return fetch('/api' + path + qs(params), { method: 'GET', credentials: 'same-origin' }).then(
        function (res) {
          if (res.ok) {
            var cd = res.headers.get('Content-Disposition') || '';
            var m = /filename="([^"]+)"/.exec(cd);
            var name = m ? m[1] : 'download';
            return res.blob().then(function (blob) {
              var url = URL.createObjectURL(blob);
              var a = document.createElement('a');
              a.href = url;
              a.download = name;
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
              return name;
            });
          }
          return res.json().catch(function () { return {}; }).then(function (data) {
            var err = makeError(
              data.message || 'Something went wrong. Please try again.',
              res.status,
              data.code || 'ERROR'
            );
            handleAuthRedirect(err, opts);
            throw err;
          });
        },
                function () {
          throw makeError('Could not reach the server. Check your connection and try again.', 0, 'NETWORK');
        }
      );
    }
  };

})(window);