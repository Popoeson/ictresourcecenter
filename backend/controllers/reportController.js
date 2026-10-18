const reportService = require('../services/reportService');
const exp = require('../services/exportService');

function send(res, data) {
  res.status(200).json({ success: true, data });
}

async function run(req) {
  const tab = req.params.tab;
  const q = reportService.cleanQuery(tab, req.query);
  const result = await reportService.build(tab, q);
  return { tab, q, ...result };
}

async function show(req, res, next) {
  try {
    const r = await run(req);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const total = r.rows.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const p = Math.min(page, totalPages);

    send(res, {
      tab: r.tab,
      view: r.q.view,
      columns: r.columns,
      items: r.rows.slice((p - 1) * limit, p * limit),
      totals: reportService.totals(r.columns, r.rows),
      chart: r.chart,
      page: p,
      limit,
      total,
      totalPages,
    });
  } catch (err) {
    next(err);
  }
}

async function exportReport(req, res, next) {
  try {
    const r = await run(req);

    const cols = r.columns.map((c) => ({
      key: c.key,
      header: c.kind === 'money' ? c.header + ' (NGN)' : c.header,
      width: c.width,
    }));
    const format = (row) => {
      const out = {};
      r.columns.forEach((c) => {
        const v = row[c.key];
        if (c.kind === 'money') out[c.key] = exp.naira(v);
        else if (c.kind === 'date') out[c.key] = exp.lagosDate(v);
        else out[c.key] = v === undefined || v === null ? '' : v;
      });
      return out;
    };

    const rows = r.rows.map(format);
    const t = reportService.totals(r.columns, r.rows);
    if (rows.length && t) rows.push(format(t));

    await exp.sendWorkbook(res, {
      filename: exp.fileName('report-' + r.tab + '-' + r.q.view),
      sheetName: 'Report',
      columns: cols,
      total: rows.length,
      fetchPage: async (skip, limit) => rows.slice(skip, skip + limit),
    });
  } catch (err) {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    next(err);
  }
}

module.exports = { show, exportReport };