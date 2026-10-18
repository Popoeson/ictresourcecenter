(function () {
  'use strict';

  var AUTO_RETRIES = 5;
  var RETRY_MS = 4000;
  var TYPE_LABEL = { ict_fee: 'ICT course fee', departmental_fee: 'Departmental fee', assignment: 'Assignment submission', handout: 'Course handout' };

  function $(id) { return document.getElementById(id); }

  var stateEl = $('state');
  var titleEl = $('state-title');
  var reference = new URLSearchParams(window.location.search).get('reference');
  var retryTimer = null;
  var retries = 0;
  var countdownTimer = null;
  var lastPayment = null;

  function setTitle(text) { titleEl.textContent = text; }

  function detailRow(label, value) {
    return '<div class="detail-row"><dt>' + UI.esc(label) + '</dt><dd>' + UI.esc(value || '-') + '</dd></div>';
  }

  function keepNote(type) {
    return '<p class="hint">Keep this page link. You can open it again to see your ' +
      (type === 'assignment' ? 'token or receipt.' : type === 'handout' ? 'handout, pickup code or receipt.' : 'receipt.') + '</p>';
  }

  function retryHref(p) {
    if (p && p.type === 'assignment') return '/submit-assignment.html';
    if (p && p.type === 'handout') return '/buy-handout.html';
    if (!p || p.type === 'ict_fee') return '/pay-fee.html';
    return '/';
  }

  function stopCountdown() {
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
  }

  /* ---------- Receipt parts shared by the success states ---------- */

  function detailsHtml(p, extraRows) {
    return '<dl class="detail-list">' +
      detailRow('Payment for', TYPE_LABEL[p.type] || p.type) +
      (extraRows || '') +
      detailRow('Amount', UI.naira(p.amount)) +
      detailRow('Paid by', p.payerName) +
      detailRow('Date', UI.fmtDate(p.paidAt)) +
      detailRow('Receipt number', p.receiptNumber) +
      detailRow('Reference', p.reference) +
      '</dl>';
  }

  function receiptHtml(p, downloadIsPrimary) {
    return '<div class="qr-block">' +
        '<img class="qr-img" src="/api/receipts/' + encodeURIComponent(p.reference) + '/qr.png" width="160" height="160" alt="QR code for verifying this receipt">' +
        '<p class="hint">Show this code to your lecturer to verify your receipt.</p>' +
      '</div>' +
      '<a class="btn ' + (downloadIsPrimary ? 'btn-primary' : 'btn-secondary') + ' btn-block" href="/api/receipts/' +
        encodeURIComponent(p.reference) + '" download>Download receipt</a>' +
      '<a class="btn btn-secondary btn-block btn-gap" href="/">Back to home</a>' +
      keepNote(p.type);
  }

  /* ---------- States ---------- */

  function renderSuccess(p, token, handout) {
    lastPayment = p;
    if (p.type === 'assignment') return renderAssignment(p, token);
    if (p.type === 'handout') return renderHandout(p, handout);

    setTitle('Payment received');
    var intro = p.type === 'ict_fee'
      ? UI.alertHtml('success', 'Your ICT fee has been paid.', 'Thank you. You can download your receipt below.')
      : UI.alertHtml('success', 'Your payment was received.', 'Download your receipt below.');
    stateEl.innerHTML = intro + detailsHtml(p) + receiptHtml(p, true);
  }

  function mmss(total) {
    var m = Math.floor(total / 60);
    var s = total % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  function payAgainHtml() {
    return '<a class="btn btn-primary btn-block" href="/submit-assignment.html">Pay again</a>';
  }

  function startCountdown(seconds) {
    stopCountdown();
    var endsAt = Date.now() + seconds * 1000;
    var said5 = false;
    var said1 = false;

    function tick() {
      var box = $('countdown');
      if (!box) { stopCountdown(); return; }
      var left = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
      box.textContent = mmss(left);
      box.className = 'countdown' + (left <= 60 ? ' countdown-low' : left <= 300 ? ' countdown-warn' : '');

      // Screen readers hear 5 minutes, 1 minute and the end, not every second
      var live = $('countdown-live');
      if (live) {
        if (left <= 300 && !said5 && left > 60) { said5 = true; live.textContent = 'Five minutes left to upload.'; }
        if (left <= 60 && !said1 && left > 0) { said1 = true; live.textContent = 'One minute left to upload.'; }
      }
      if (left <= 0) {
        stopCountdown();
        renderAssignment(lastPayment, { status: 'expired' });
      }
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function copyToken(code) {
    function done() { UI.toast('Code copied', 'success'); }
    function fallback() {
      try {
        var range = document.createRange();
        range.selectNodeContents($('token-code'));
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        if (document.execCommand('copy')) { done(); return; }
      } catch (e) { /* fall through */ }
      UI.toast('Press and hold the code to copy it.', 'info');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, fallback);
    } else {
      fallback();
    }
  }

  function renderAssignment(p, token) {
    setTitle('Payment received');
    stopCountdown();

    var live = !!(token && token.code && token.secondsLeft > 0 && token.status !== 'used' && token.status !== 'revoked');
    var rows = token && token.filesAllowed ? detailRow('Files paid for', String(token.filesAllowed)) : '';

    if (live) {
      stateEl.innerHTML =
        UI.alertHtml('success', 'Your payment was received.', 'Use your token to upload your files.') +
        '<section class="token-card" aria-label="Your token">' +
          '<p class="token-label">Your token</p>' +
          '<p class="token-code" id="token-code">' + UI.esc(token.code) + '</p>' +
          '<button type="button" class="btn btn-secondary btn-small" id="copy-token">Copy token</button>' +
          '<p class="token-meta">Time left: <span class="countdown" id="countdown" aria-hidden="true">' + mmss(token.secondsLeft) + '</span></p>' +
          '<p class="sr-only" id="countdown-live" role="status" aria-live="polite"></p>' +
          '<p class="hint">You can upload up to ' + UI.esc(token.filesAllowed) + ' file' + (token.filesAllowed === 1 ? '' : 's') +
            ' (5 MB each). Valid for 30 minutes from payment.</p>' +
        '</section>' +
        '<a class="btn btn-primary btn-block" id="continue-upload" href="/upload.html#' + encodeURIComponent(token.code) + '">Continue to upload</a>' +
        detailsHtml(p, rows) + receiptHtml(p, false);
      $('copy-token').addEventListener('click', function () { copyToken(token.code); });
      startCountdown(token.secondsLeft);
      return;
    }

    var status = token ? token.status : 'expired';
    var message;
    if (status === 'used') {
      message = UI.alertHtml('info', 'This token has already been used.', 'Your files were submitted. You can still download your receipt below.') +
        '<a class="btn btn-secondary btn-block" href="/submit-assignment.html">Submit more files</a>';
    } else if (status === 'revoked') {
      message = UI.alertHtml('warning', 'This token is no longer valid.', 'Please contact your course lecturer. You can still download your receipt below.');
    } else {
      message = UI.alertHtml('warning', 'The time for this token is over.',
        'Pay again for a new token and a new 30 minutes. You can still download your receipt below.') + payAgainHtml();
    }
    stateEl.innerHTML = message + detailsHtml(p, rows) + receiptHtml(p, false);
  }

  function renderHandout(p, h) {
    setTitle('Payment received');
    var rows = h ? detailRow('Delivery', h.delivery === 'pdf' ? 'PDF download' : 'Pickup') : '';
    var details = detailsHtml(p, rows);

    if (!h) {
      stateEl.innerHTML =
        UI.alertHtml('success', 'Your payment was received.',
          'We are still preparing your order. Reload this page in a moment. Your receipt is ready below.') +
        details + receiptHtml(p, true);
      return;
    }

    if (h.delivery === 'pickup') {
      var intro = h.pickupStatus === 'collected'
        ? UI.alertHtml('info', 'This copy has been collected.', 'Your receipt is below.')
        : UI.alertHtml('success', 'Your payment was received.', 'Show your pickup code when you collect your copy.');
      stateEl.innerHTML = intro +
        '<section class="token-card" aria-label="Your pickup code">' +
          '<p class="token-label">Your pickup code</p>' +
          '<p class="token-code" id="token-code">' + UI.esc(h.pickupCode) + '</p>' +
          '<button type="button" class="btn btn-secondary btn-small" id="copy-pickup">Copy code</button>' +
          '<p class="hint">Show this code to your course lecturer when you collect your copy.</p>' +
        '</section>' +
        details + receiptHtml(p, true);
      $('copy-pickup').addEventListener('click', function () { copyToken(h.pickupCode); });
      return;
    }

    var intro2 = h.pdfAvailable
      ? UI.alertHtml('success', 'Your payment was received.', 'Download your handout below.')
      : UI.alertHtml('warning', 'Your handout PDF is not available right now.',
          'Please contact your course lecturer and give them your reference. Your receipt is below.');
    var action = h.pdfAvailable
      ? '<button type="button" class="btn btn-primary btn-block" id="download-handout">Download handout</button>'
      : '';
    stateEl.innerHTML = intro2 + action + details + receiptHtml(p, false);

    var dl = $('download-handout');
    if (dl) {
      dl.addEventListener('click', function () {
        dl.disabled = true;
        UI.showLoader('Preparing your download...');
        Api.get('/handouts/link/' + encodeURIComponent(p.reference)).then(
          function (r) {
            UI.hideLoader();
            dl.disabled = false;
            window.location.href = r.url;
          },
          function (err) {
            UI.hideLoader();
            dl.disabled = false;
            UI.toast(err.message, 'error');
          }
        );
      });
    }
  }

  function renderNotCompleted(p) {
    setTitle('Payment not completed');
    stateEl.innerHTML =
      UI.alertHtml('info', 'Payment was not completed.', 'You have not been charged.') +
      '<a class="btn btn-primary btn-block" href="' + retryHref(p) + '">Try again</a>' +
      '<a class="btn btn-secondary btn-block btn-gap" href="/">Back to home</a>';
  }

  function renderProcessing(auto) {
    setTitle('Confirming your payment');
    stateEl.innerHTML =
      UI.alertHtml('warning', 'We are still confirming your payment.',
        auto ? 'This page will check again in a few seconds.' : 'Please wait a moment and check again.') +
      '<button type="button" class="btn btn-primary btn-block" id="check-again">Check again</button>' +
      '<p class="hint">If you were charged, do not pay again. Keep this page link and come back to it shortly.</p>';
    $('check-again').addEventListener('click', function () { check(true); });
  }

  function renderFlagged(p) {
    setTitle('We need to check your payment');
    stateEl.innerHTML =
      UI.alertHtml('warning', 'We could not complete this payment automatically.',
        'Please contact your course lecturer and give them this reference. Do not pay again.') +
      '<dl class="detail-list">' + detailRow('Reference', p ? p.reference : reference) + '</dl>' +
      '<a class="btn btn-secondary btn-block" href="/">Back to home</a>';
  }

  function renderError(message) {
    setTitle('Payment');
    stateEl.innerHTML =
      UI.alertHtml('error', message, 'Check the link and try again.') +
      '<a class="btn btn-secondary btn-block" href="/">Back to home</a>';
  }

  /* ---------- Checking ---------- */

  function handle(result) {
    var p = result.payment;
    if (result.outcome === 'success') return renderSuccess(p, result.token, result.handout);
    stopCountdown();
    if (result.outcome === 'not_completed') return renderNotCompleted(p);
    if (result.outcome === 'flagged') return renderFlagged(p);
    scheduleRetry();
  }

  function scheduleRetry() {
    if (retries < AUTO_RETRIES) {
      retries += 1;
      renderProcessing(true);
      clearTimeout(retryTimer);
      retryTimer = setTimeout(function () { check(false); }, RETRY_MS);
    } else {
      renderProcessing(false);
    }
  }

  function check(showOverlay) {
    clearTimeout(retryTimer);
    if (showOverlay) UI.showLoader('Confirming your payment...');
    Api.get('/payments/verify/' + encodeURIComponent(reference)).then(
      function (result) {
        if (showOverlay) UI.hideLoader();
        handle(result);
      },
      function (err) {
        if (showOverlay) UI.hideLoader();
        if (err.status === 404) return renderError('We could not find that payment.');
        if (err.status === 400) return renderError('That payment link is not valid.');
        // Network trouble or Paystack not reachable: treat as still confirming
        scheduleRetry();
      }
    );
  }

  /* ---------- Start ---------- */

  $('year').textContent = new Date().getFullYear();
  if (!reference) {
    renderError('This payment link is missing its reference.');
  } else {
    check(true);
  }
})();