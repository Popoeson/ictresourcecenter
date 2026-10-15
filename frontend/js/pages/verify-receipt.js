(function () {
  'use strict';

  var TYPE_LABEL = { ict_fee: 'ICT course fee', assignment: 'Assignment submission', handout: 'Course handout' };

  function $(id) { return document.getElementById(id); }

  var stateEl = $('state');
  var reference = new URLSearchParams(window.location.search).get('reference');

  function detailRow(label, value) {
    return '<div class="detail-row"><dt>' + UI.esc(label) + '</dt><dd>' + UI.esc(value || '-') + '</dd></div>';
  }

  function renderValid(r) {
    stateEl.innerHTML =
      UI.alertHtml('success', 'Valid receipt', 'This payment was received and recorded.') +
      '<dl class="detail-list">' +
        detailRow('Paid by', r.payerName) +
        detailRow('Institution', r.institution) +
        detailRow('Level', r.level) +
        detailRow('Payment for', TYPE_LABEL[r.type] || r.type) +
        detailRow('Amount', UI.naira(r.amount)) +
        detailRow('Date', UI.fmtDate(r.paidAt)) +
        detailRow('Receipt number', r.receiptNumber) +
        detailRow('Reference', r.reference) +
      '</dl>' +
      '<p class="hint">Check that the name above matches the person presenting this receipt.</p>';
  }

  function renderInvalid() {
    stateEl.innerHTML =
      UI.alertHtml('error', 'This receipt could not be verified.',
        'The code may be wrong, or the payment was not completed. Do not accept this receipt.') +
      '<a class="btn btn-secondary btn-block" href="/">Back to home</a>';
  }

  function renderError(message) {
    stateEl.innerHTML =
      UI.alertHtml('warning', message, 'Check your connection and scan the code again.') +
      '<button type="button" class="btn btn-primary btn-block" id="try-again">Try again</button>';
    $('try-again').addEventListener('click', check);
  }

  function check() {
    UI.showLoader('Checking receipt...');
    Api.get('/receipts/' + encodeURIComponent(reference) + '/verify').then(
      function (r) { UI.hideLoader(); renderValid(r); },
      function (err) {
        UI.hideLoader();
        if (err.status === 404 || err.status === 400) renderInvalid();
        else renderError(err.message);
      }
    );
  }

  $('year').textContent = new Date().getFullYear();
  if (!reference) renderInvalid();
  else check();
})();