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

  global.UI = {
    esc: esc,
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