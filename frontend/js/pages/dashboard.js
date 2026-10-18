(function () {
  'use strict';

  var TYPE_LABEL = { ict_fee: 'ICT fee', assignment: 'Assignment', handout: 'Handout' };
  var STATUS = {
    success: ['Paid', 'green'],
    pending: ['Pending', 'amber'],
    flagged: ['Flagged', 'red'],
    failed: ['Failed', 'red'],
    abandoned: ['Abandoned', 'grey']
  };

  function $(id) { return document.getElementById(id); }
  function num(n) { return Number(n || 0).toLocaleString('en-NG'); }
  function plural(n, one, many) { return n === 1 ? one : many; }

  var alertEl = $('page-alert');
  function showAlert(type, title, text) { alertEl.innerHTML = UI.alertHtml(type, title, text); }

  function statCard(value, label) {
    return '<div class="stat-card"><div class="stat-value">' + UI.esc(value) + '</div>' +
      '<div class="stat-label">' + UI.esc(label) + '</div></div>';
  }

  function renderStats(d) {
    var cards = [];
    if (d.money) {
      cards.push(statCard(UI.naira(d.money.total), 'Total money collected'));
      cards.push(statCard(UI.naira(d.money.thisWeek), 'Collected this week'));
    }
    cards.push(statCard(num(d.stats.students), 'Total students'));
    cards.push(statCard(num(d.stats.ictFeesPaid), 'ICT fees paid'));
    cards.push(statCard(num(d.stats.submissions), 'Assignments submitted'));
    cards.push(statCard(num(d.stats.handouts), 'Handouts sold'));
    $('stat-grid').innerHTML = cards.join('');
  }

  function renderAttention(a, isSuper) {
    var items = [];

    if (a.pendingPayments > 0) {
      items.push({
        text: '<strong>' + num(a.pendingPayments) + '</strong> ' +
          plural(a.pendingPayments, 'payment has', 'payments have') + ' been waiting to be confirmed for a while.',
        hint: isSuper ? 'Open Payments, filter by Pending, and use Re-verify.' : 'Open Payments and filter by Pending.',
        href: '/admin/payments.html',
        link: 'Open Payments'
      });
    }
    if (a.flaggedPayments > 0) {
      items.push({
        text: '<strong>' + num(a.flaggedPayments) + '</strong> ' +
          plural(a.flaggedPayments, 'payment is', 'payments are') + ' flagged.',
        hint: isSuper ? 'Open Payments and filter by Flagged to see the reasons.' : 'Open Payments and filter by Flagged.',
        href: '/admin/payments.html',
        link: 'Open Payments'
      });
    }
    if (a.pickupsWaiting > 0) {
      items.push({
        text: '<strong>' + num(a.pickupsWaiting) + '</strong> hard ' +
          plural(a.pickupsWaiting, 'copy is', 'copies are') + ' waiting to be collected.',
        hint: 'Open Handout orders and filter by Pickup: Waiting.',
        href: '/admin/handouts.html',
        link: 'Open Handout orders'
      });
    }

    if (!items.length) {
      $('attention').innerHTML = UI.alertHtml('success', 'Nothing needs your attention right now.', '');
      return;
    }

    $('attention').innerHTML = '<ul class="attention-list">' + items.map(function (i) {
      return '<li class="attention-item"><span>' + i.text + '<span class="hint"> ' + UI.esc(i.hint) + '</span></span>' +
        '<a class="btn btn-secondary btn-small" href="' + i.href + '">' + UI.esc(i.link) + '</a></li>';
    }).join('') + '</ul>';
  }

  function paymentRow(p) {
    var s = STATUS[p.status] || [p.status, 'grey'];
    return '<tr>' +
      '<td data-label="Date">' + UI.esc(UI.fmtDate(p.createdAt)) + '</td>' +
      '<td data-label="Paid by"><span class="student-name">' + UI.esc(p.payerName || '\u2014') + '</span></td>' +
      '<td data-label="Payment for">' + UI.esc(TYPE_LABEL[p.type] || p.type) + '</td>' +
      '<td data-label="Amount">' + UI.esc(UI.naira(p.amount)) + '</td>' +
      '<td data-label="Status">' + UI.badge(s[0], s[1]) + '</td>' +
      '</tr>';
  }

  function renderRecent(list) {
    $('recent-status').textContent = '';
    if (!list.length) {
      $('recent-empty').classList.remove('hidden');
      return;
    }
    $('recent-body').innerHTML = list.map(paymentRow).join('');
    $('recent-wrap').classList.remove('hidden');
    $('recent-more').classList.remove('hidden');
  }

  function load(isSuper) {
    Api.get('/admin/dashboard').then(
      function (d) {
        renderStats(d);
        renderAttention(d.attention, isSuper);
        renderRecent(d.recent);
      },
      function (err) {
        $('attention').innerHTML = '';
        $('recent-status').textContent = '';
        showAlert('error', err.message, 'Reload the page to try again.');
      }
    );
  }

  Auth.init({ page: 'dashboard' }).then(function (admin) {
    var name = Auth.firstName(admin.name);
    $('greeting').textContent = Auth.greeting() + (name ? ', ' + name : '');
    load(admin.role === 'superadmin');
  });
})();