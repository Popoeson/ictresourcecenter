(function () {
  'use strict';

  var AUTO_RETRIES = 5;
  var RETRY_MS = 4000;
  var TYPE_LABEL = { ict_fee: 'ICT course fee', assignment: 'Assignment submission', handout: 'Course handout' };

  function $(id) { return document.getElementById(id); }

  var stateEl = $('state');
  var titleEl = $('state-title');
  var reference = new URLSearchParams(window.location.search).get('reference');
  var retryTimer = null;
  var retries = 0;

  function setTitle(text) { titleEl.textContent = text; }

  function detailRow(label, value) {
    return '<div class="detail-row"><dt>' + UI.esc(label) + '</dt><dd>' + UI.esc(value || '-') + '</dd></div>';
  }

  function keepNote() {
    return '<p class="hint">Keep this page link. You can open it again to see your receipt.</p>';
  }

  /* ---------- States ---------- */

  function renderSuccess(p) {
    setTitle('Payment received');
    var intro = p.type === 'ict_fee'
      ? UI.alertHtml('success', 'Your ICT fee has been paid.', 'Thank you. You can download your receipt below.')
      : UI.alertHtml('success', 'Your payment was received.', 'Download your receipt below.');
    stateEl.innerHTML = intro +
      '<dl class="detail-list">' +
        detailRow('Payment for', TYPE_LABEL[p.type] || p.type) +
        detailRow('Amount', UI.naira(p.amount)) +
        detailRow('Paid by', p.payerName) +
        detailRow('Date', UI.fmtDate(p.paidAt)) +
        detailRow('Receipt number', p.receiptNumber) +
        detailRow('Reference', p.reference) +
            '</dl>' +
      '<div class="qr-block">' +
        '<img class="qr-img" src="/api/receipts/' + encodeURIComponent(p.reference) + '/qr.png" width="160" height="160" alt="QR code for verifying this receipt">' +
        '<p class="hint">Show this code to your lecturer to verify your receipt.</p>' +
      '</div>' +
      '<a class="btn btn-primary btn-block" href="/api/receipts/' + encodeURIComponent(p.reference) + '" download>Download receipt</a>' +
      '<a class="btn btn-secondary btn-block btn-gap" href="/">Back to home</a>' +
      keepNote();
  }

  function renderNotCompleted(p) {
    setTitle('Payment not completed');
    var retryHref = !p || p.type === 'ict_fee' ? '/pay-fee.html' : '/';
    stateEl.innerHTML =
      UI.alertHtml('info', 'Payment was not completed.', 'You have not been charged.') +
      '<a class="btn btn-primary btn-block" href="' + retryHref + '">Try again</a>' +
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
    if (result.outcome === 'success') return renderSuccess(p);
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