// Shared UI helpers: loader, toasts, modals, alerts, selects, formatting
(function (global) {
  'use strict';

  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

  function esc(v) {
    return String(v === null || v === undefined ? '' : v).replace(/[&<>"']/g, function (c) { return ESC[c]; });
  }

  /* Loader overlay with a message */
  var loaderEl = null;
  var loaderCount = 0;

  function ensureLoader() {
    if (loaderEl) return loaderEl;
    loaderEl = document.createElement('div');
    loaderEl.className = 'loader-overlay hidden';
    loaderEl.setAttribute('role', 'status');
    loaderEl.setAttribute('aria-live', 'polite');
    loaderEl.innerHTML = '<div class="loader-ring"></div><p class="loader-text"></p>';
    document.body.appendChild(loaderEl);
    return loaderEl;
  }

  function showLoader(message) {
    var el = ensureLoader();
    loaderCount += 1;
    el.querySelector('.loader-text').textContent = message || 'Loading...';
    el.classList.remove('hidden');
  }

  function hideLoader() {
    loaderCount = Math.max(0, loaderCount - 1);
    if (loaderCount === 0 && loaderEl) loaderEl.classList.add('hidden');
  }

  /* Toasts */
  function toast(message, type) {
    var wrap = document.getElementById('toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'toast-wrap';
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 4000);
  }

  /* Inline alert: type is success, warning, error or info */
  function alertHtml(type, title, text) {
    return '<div class="alert alert-' + type + '" role="alert"><strong>' + esc(title) + '</strong>' +
      (text ? '<span>' + esc(text) + '</span>' : '') + '</div>';
  }

  /* Modal. actions: [{ label, kind: 'primary'|'secondary'|'danger', onClick(modal) }] */
  function modal(opts) {
    var previous = document.activeElement;
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var titleId = 'modal-title-' + Date.now();
    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="' + titleId + '">' +
      '<h2 id="' + titleId + '">' + esc(opts.title || '') + '</h2>' +
      '<div class="modal-body">' + (opts.bodyHtml || '') + '</div>' +
      '<div class="modal-actions"></div></div>';

    var api = { el: backdrop.querySelector('.modal'), close: close };
    var closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      if (previous && previous.focus) previous.focus();
      if (opts.onClose) opts.onClose();
    }

    function onKey(e) { if (e.key === 'Escape') close(); }

    var actionsEl = backdrop.querySelector('.modal-actions');
    (opts.actions || []).forEach(function (a) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-' + (a.kind || 'secondary');
      b.textContent = a.label;
      b.addEventListener('click', function () { if (a.onClick) a.onClick(api); else close(); });
      actionsEl.appendChild(b);
    });

    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) close(); });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(backdrop);

    var first = backdrop.querySelector('input, select, textarea, button');
    if (first) first.focus();
    return api;
  }

  /* Confirmation dialog. Returns a promise that resolves true or false. */
  function confirmDialog(opts) {
    return new Promise(function (resolve) {
      modal({
        title: opts.title || 'Are you sure?',
        bodyHtml: '<p>' + esc(opts.message || '') + '</p>',
        actions: [
          { label: opts.cancelText || 'Cancel', kind: 'secondary', onClick: function (m) { m.close(); } },
          { label: opts.confirmText || 'Confirm', kind: opts.danger ? 'danger' : 'primary',
            onClick: function (m) { resolve(true); m.close(); } }
        ],
        onClose: function () { resolve(false); }
      });
    });
  }

  /* Fill a drop-down. items: [{ id, name }] or use opts.value and opts.label */
  function fillSelect(select, items, opts) {
    opts = opts || {};
    var vk = opts.value || 'id';
    var lk = opts.label || 'name';
    select.innerHTML = '<option value="">' + esc(opts.placeholder || 'Select') + '</option>' +
      items.map(function (i) {
        return '<option value="' + esc(i[vk]) + '">' + esc(i[lk]) + '</option>';
      }).join('');
  }

  /* Field errors: message appears under the field, with an icon from the stylesheet */
  function setFieldError(input, message) {
    var field = input.closest('.field');
    if (!field) return;
    clearFieldError(input);
    input.classList.add('invalid');
    var p = document.createElement('p');
    p.className = 'field-error';
    p.id = (input.id || 'f' + Date.now()) + '-error';
    p.textContent = message;
    input.setAttribute('aria-describedby', p.id);
    field.appendChild(p);
  }

  function clearFieldError(input) {
    var field = input.closest('.field');
    input.classList.remove('invalid');
    input.removeAttribute('aria-describedby');
    if (field) {
      var old = field.querySelector('.field-error');
      if (old) old.parentNode.removeChild(old);
    }
  }

  /* Formatting */
  function badge(text, color) {
    return '<span class="badge badge-' + (color || 'grey') + '">' + esc(text) + '</span>';
  }

  function naira(kobo) {
    if (kobo === null || kobo === undefined) return '\u2014';
    var whole = kobo % 100 === 0;
    return '\u20A6' + (kobo / 100).toLocaleString('en-NG', {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2
    });
  }

  // "3,000" or "\u20A63000.50" becomes kobo, or null if empty or invalid
  function toKobo(text) {
    var cleaned = String(text === null || text === undefined ? '' : text).replace(/[\u20A6,\s]/g, '');
    if (cleaned === '') return null;
    var n = parseFloat(cleaned);
    return isNaN(n) ? null : Math.round(n * 100);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
  }

    /* Icons (24px line icons) */
  var ICONS = {
    menu: '<line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/>',
    grid: '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
    book: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
    tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    chart: '<path d="M3 3v18h18"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>',
    layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
    sliders: '<line x1="21" x2="14" y1="4" y2="4"/><line x1="10" x2="3" y1="4" y2="4"/><line x1="21" x2="12" y1="12" y2="12"/><line x1="8" x2="3" y1="12" y2="12"/><line x1="21" x2="16" y1="20" y2="20"/><line x1="12" x2="3" y1="20" y2="20"/><line x1="14" x2="14" y1="2" y2="6"/><line x1="8" x2="8" y1="10" y2="14"/><line x1="16" x2="16" y1="18" y2="22"/>',
    key: '<path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4"/><path d="m21 2-9.6 9.6"/><circle cx="7.5" cy="15.5" r="5.5"/>',
    clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M12 11h4"/><path d="M12 16h4"/><path d="M8 11h.01"/><path d="M8 16h.01"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    eyeoff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>'
  };

  function icon(name, size) {
    size = size || 24;
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }

  /* Show or hide a password. Each .password-toggle button sits next to its input. */
  function bindPasswordToggles(root) {
    (root || document).querySelectorAll('.password-toggle').forEach(function (btn) {
      var input = btn.parentNode.querySelector('input');
      btn.innerHTML = icon('eye');
      btn.addEventListener('click', function () {
        var show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.innerHTML = icon(show ? 'eyeoff' : 'eye');
        btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      });
    });
  }

  global.UI = {
    esc: esc,
    icon: icon,
    bindPasswordToggles: bindPasswordToggles,
    showLoader: showLoader,
    hideLoader: hideLoader,
    toast: toast,
    alertHtml: alertHtml,
    modal: modal,
    confirm: confirmDialog,
    fillSelect: fillSelect,
    setFieldError: setFieldError,
    clearFieldError: clearFieldError,
    badge: badge,
    naira: naira,
    toKobo: toKobo,
    fmtDate: fmtDate
  };
})(window);