/* Controle de Vendas Online — Amazon, Shopee, Mercado Livre, Magalu
   Tudo roda no navegador; os dados ficam em localStorage. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- Plataformas
  const PLATFORMS = [
    { id: 'amazon', name: 'Amazon', short: 'AMZ', color: '#1baf7a',
      defaults: { commission: 12, fixedFee: 0, fixedFeeBelow: 0, tax: 6, shipping: 0 } },
    { id: 'shopee', name: 'Shopee', short: 'SHP', color: '#e34948',
      defaults: { commission: 20, fixedFee: 4, fixedFeeBelow: 0, tax: 6, shipping: 0 } },
    { id: 'mercadolivre', name: 'Mercado Livre', short: 'ML', color: '#eda100',
      defaults: { commission: 14, fixedFee: 6.25, fixedFeeBelow: 79, tax: 6, shipping: 0 } },
    { id: 'magalu', name: 'Magazine Luiza', short: 'MGL', color: '#2a78d6',
      defaults: { commission: 16, fixedFee: 5, fixedFeeBelow: 0, tax: 6, shipping: 0 } },
  ];
  const PMAP = Object.fromEntries(PLATFORMS.map(p => [p.id, p]));
  const SALE_STATUS = {
    pendente: { label: 'Pendente', cls: 'warn', counts: true, stock: true },
    enviada: { label: 'Enviada', cls: '', counts: true, stock: true },
    entregue: { label: 'Entregue', cls: 'good', counts: true, stock: true },
    devolvida: { label: 'Devolvida', cls: 'bad', counts: false, stock: false },
    cancelada: { label: 'Cancelada', cls: 'bad', counts: false, stock: false },
  };
  const EXPENSE_CATS = ['Anúncios / ADS', 'Mensalidade / plano', 'Frete extra', 'Embalagens', 'Fotos / design', 'Software / ERP', 'Funcionários', 'Contador', 'Devoluções', 'Outros'];
  const NEUTRAL_A = '#c9c8c2'; // faturamento
  const NEUTRAL_B = '#3d3c39'; // lucro

  // ---------------------------------------------------------------- Banco local
  const DB_KEY = 'cv_db_v1';
  function freshDB() {
    const platforms = {};
    PLATFORMS.forEach(p => { platforms[p.id] = Object.assign({}, p.defaults); });
    return { version: 1, settings: { storeName: 'Minha Loja', pinHash: '', platforms }, products: [], sales: [], expenses: [] };
  }
  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (!raw) return freshDB();
      const db = JSON.parse(raw);
      return normalizeDB(db);
    } catch (e) { return freshDB(); }
  }
  function normalizeDB(db) {
    const base = freshDB();
    db = db && typeof db === 'object' ? db : {};
    db.settings = Object.assign(base.settings, db.settings || {});
    PLATFORMS.forEach(p => { db.settings.platforms[p.id] = Object.assign({}, p.defaults, (db.settings.platforms || {})[p.id] || {}); });
    db.products = Array.isArray(db.products) ? db.products : [];
    db.sales = Array.isArray(db.sales) ? db.sales : [];
    db.expenses = Array.isArray(db.expenses) ? db.expenses : [];
    db.version = 1;
    return db;
  }
  let db = loadDB();
  let storageOk = true;
  function save() {
    try { localStorage.setItem(DB_KEY, JSON.stringify(db)); storageOk = true; }
    catch (e) { storageOk = false; toast('Não foi possível salvar no navegador. Exporte um backup!'); }
  }

  // ---------------------------------------------------------------- Utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const BRL0 = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
  const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
  const money = v => BRL.format(isFinite(v) ? v : 0);
  const money0 = v => BRL0.format(isFinite(v) ? v : 0);
  const moneyShort = v => {
    const a = Math.abs(v);
    if (a >= 1e6) return 'R$ ' + NUM.format(+(v / 1e6).toFixed(1)) + ' mi';
    if (a >= 1e4) return 'R$ ' + NUM.format(+(v / 1e3).toFixed(1)) + ' mil';
    return money0(v);
  };
  const pct = (v, d = 1) => isFinite(v) ? (v * 100).toFixed(d).replace('.', ',') + '%' : '—';
  const n2 = v => NUM.format(isFinite(v) ? v : 0);
  function parseNum(v) {
    if (typeof v === 'number') return v;
    if (v == null) return 0;
    let s = String(v).trim().replace(/[R$\s%]/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  }
  const fmtInput = v => (v == null || v === '' ? '' : String(+(+v).toFixed(4)).replace('.', ','));
  const pad = n => String(n).padStart(2, '0');
  const isoDate = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const todayStr = () => isoDate(new Date());
  const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseISO(s); d.setDate(d.getDate() + n); return isoDate(d); };
  const fmtDate = s => s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : '';
  const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const cls = v => v > 0.0001 ? 'pos' : v < -0.0001 ? 'neg' : '';

  function toast(msg) {
    $$('.toast').forEach(x => x.remove());
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // ---------------------------------------------------------------- Cálculos
  function prodCalc(p) {
    const price = +p.price || 0, cost = +p.cost || 0;
    const taxV = price * (+p.tax || 0) / 100;
    const commV = price * (+p.commission || 0) / 100;
    const fixed = +p.fixedFee || 0, ship = +p.shipping || 0, pack = +p.packaging || 0, other = +p.otherCosts || 0;
    const totalCost = cost + taxV + commV + fixed + ship + pack + other;
    const profit = price - totalCost;
    const varPct = ((+p.tax || 0) + (+p.commission || 0)) / 100;
    const fixedCosts = cost + fixed + ship + pack + other;
    const invested = cost + pack + other;
    const priceFor = m => (1 - varPct - m) > 0 ? fixedCosts / (1 - varPct - m) : NaN;
    return {
      price, cost, taxV, commV, fixed, ship, pack, other, totalCost, profit,
      margin: price ? profit / price : 0,
      markup: cost ? (price - cost) / cost : 0,
      multiplier: cost ? price / cost : 0,
      roi: invested ? profit / invested : 0,
      breakEven: priceFor(0),
      priceFor,
      stockValue: cost * (+p.stock || 0),
      stockRevenue: price * (+p.stock || 0),
      stockProfit: profit * (+p.stock || 0),
    };
  }
  function saleCalc(s) {
    const st = SALE_STATUS[s.status] || SALE_STATUS.entregue;
    const qty = +s.qty || 0;
    const gross = (+s.unitPrice || 0) * qty;
    const discount = +s.discount || 0;
    const revenue = Math.max(0, gross - discount);
    const cogs = (+s.unitCost || 0) * qty;
    const packOther = ((+s.packaging || 0) + (+s.otherCosts || 0)) * qty;
    const taxV = revenue * (+s.tax || 0) / 100;
    const commV = revenue * (+s.commission || 0) / 100;
    const fixed = (+s.fixedFee || 0) * qty;
    const ship = +s.shipping || 0;
    if (!st.counts) {
      // Cancelada: não conta. Devolvida: só o frete pago vira prejuízo.
      const loss = s.status === 'devolvida' ? ship : 0;
      return { counts: false, qty: 0, gross: 0, discount: 0, revenue: 0, cogs: 0, packOther: 0, taxV: 0, commV: 0, fixed: 0, ship: loss, fees: 0, totalCost: loss, profit: -loss, margin: 0 };
    }
    const totalCost = cogs + packOther + taxV + commV + fixed + ship;
    const profit = revenue - totalCost;
    return { counts: true, qty, gross, discount, revenue, cogs, packOther, taxV, commV, fixed, ship, fees: commV + fixed, totalCost, profit, margin: revenue ? profit / revenue : 0 };
  }
  function aggregate(sales, expenses) {
    const a = { orders: 0, units: 0, revenue: 0, discount: 0, cogs: 0, packOther: 0, taxV: 0, commV: 0, fixed: 0, ship: 0, profit: 0, expenses: 0, cancelled: 0, returned: 0 };
    sales.forEach(s => {
      const c = saleCalc(s);
      if (s.status === 'cancelada') a.cancelled++;
      if (s.status === 'devolvida') a.returned++;
      if (c.counts) { a.orders++; a.units += c.qty; }
      a.revenue += c.revenue; a.discount += c.discount; a.cogs += c.cogs; a.packOther += c.packOther;
      a.taxV += c.taxV; a.commV += c.commV; a.fixed += c.fixed; a.ship += c.ship; a.profit += c.profit;
    });
    (expenses || []).forEach(e => { a.expenses += +e.amount || 0; });
    a.net = a.profit - a.expenses;
    a.margin = a.revenue ? a.profit / a.revenue : 0;
    a.netMargin = a.revenue ? a.net / a.revenue : 0;
    a.ticket = a.orders ? a.revenue / a.orders : 0;
    a.invested = a.cogs + a.packOther;
    a.roi = a.invested ? a.net / a.invested : 0;
    return a;
  }

  // ---------------------------------------------------------------- Período
  const PERIODS = [
    ['mes', 'Este mês'], ['mespassado', 'Mês passado'], ['30', '30 dias'], ['90', '90 dias'], ['ano', 'Este ano'], ['tudo', 'Tudo'], ['custom', 'Personalizado'],
  ];
  let period = { key: 'mes', from: '', to: '' };
  try { const p = JSON.parse(localStorage.getItem('cv_period') || 'null'); if (p && p.key) period = p; } catch (e) { /* sem storage */ }
  function savePeriod() { try { localStorage.setItem('cv_period', JSON.stringify(period)); } catch (e) { /* ok */ } }
  function getRange() {
    const t = todayStr(); const d = new Date();
    switch (period.key) {
      case 'mes': return { from: t.slice(0, 8) + '01', to: t };
      case 'mespassado': {
        const f = new Date(d.getFullYear(), d.getMonth() - 1, 1), l = new Date(d.getFullYear(), d.getMonth(), 0);
        return { from: isoDate(f), to: isoDate(l) };
      }
      case '30': return { from: addDays(t, -29), to: t };
      case '90': return { from: addDays(t, -89), to: t };
      case 'ano': return { from: t.slice(0, 4) + '-01-01', to: t };
      case 'custom': return { from: period.from || addDays(t, -29), to: period.to || t };
      default: {
        const dates = db.sales.map(s => s.date).concat(db.expenses.map(e => e.date)).filter(Boolean).sort();
        return { from: dates[0] || addDays(t, -29), to: dates.length && dates[dates.length - 1] > t ? dates[dates.length - 1] : t };
      }
    }
  }
  const inRange = (s, r) => s && s >= r.from && s <= r.to;
  function previousRange(r) {
    const days = Math.round((parseISO(r.to) - parseISO(r.from)) / 864e5) + 1;
    return { from: addDays(r.from, -days), to: addDays(r.from, -1) };
  }
  function buckets(r) {
    const days = Math.round((parseISO(r.to) - parseISO(r.from)) / 864e5) + 1;
    const out = [];
    if (days <= 62) {
      for (let s = r.from; s <= r.to; s = addDays(s, 1)) out.push({ key: s, label: s.slice(8, 10) + '/' + s.slice(5, 7) });
      return { mode: 'day', list: out, keyOf: s => s };
    }
    let y = +r.from.slice(0, 4), m = +r.from.slice(5, 7);
    const ey = +r.to.slice(0, 4), em = +r.to.slice(5, 7);
    while (y < ey || (y === ey && m <= em)) {
      out.push({ key: y + '-' + pad(m), label: MONTHS[m - 1] + '/' + String(y).slice(2) });
      m++; if (m > 12) { m = 1; y++; }
    }
    return { mode: 'month', list: out, keyOf: s => s.slice(0, 7) };
  }
  function periodLabel() {
    const r = getRange();
    const p = PERIODS.find(x => x[0] === period.key);
    return (p ? p[1] : '') + ' · ' + fmtDate(r.from) + ' a ' + fmtDate(r.to);
  }

  // ---------------------------------------------------------------- Seleções
  const salesOf = (pid, r) => db.sales.filter(s => (!pid || s.platform === pid) && (!r || inRange(s.date, r)));
  const expensesOf = (pid, r) => db.expenses.filter(e => (pid ? e.platform === pid : true) && (!r || inRange(e.date, r)));
  const productsOf = pid => db.products.filter(p => p.platform === pid);
  const productById = id => db.products.find(p => p.id === id);

  // ---------------------------------------------------------------- Charts
  let charts = [];
  function destroyCharts() { charts.forEach(c => { try { c.destroy(); } catch (e) { /* ok */ } }); charts = []; }
  const hasChart = typeof window.Chart !== 'undefined';
  if (hasChart) {
    Chart.defaults.font.family = '"Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = '#52514e';
    Chart.defaults.borderColor = '#ecebe6';
    Chart.defaults.plugins.legend.display = false;
    Chart.defaults.plugins.tooltip.backgroundColor = '#151513';
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.boxPadding = 4;
    Chart.defaults.maintainAspectRatio = false;
    Chart.register({
      id: 'valueLabels',
      afterDatasetsDraw(chart, args, opts) {
        if (!opts || !opts.enabled) return;
        const ctx = chart.ctx; const horiz = chart.options.indexAxis === 'y';
        chart.data.datasets.forEach((ds, i) => {
          const meta = chart.getDatasetMeta(i);
          if (meta.hidden) return;
          meta.data.forEach((el, j) => {
            const v = ds.data[j]; if (v == null || (opts.skipZero && !v)) return;
            const txt = opts.format ? opts.format(v, j) : String(v);
            ctx.save(); ctx.fillStyle = '#3d3c39'; ctx.font = '600 11px system-ui, sans-serif';
            if (horiz) { ctx.textBaseline = 'middle'; ctx.textAlign = v >= 0 ? 'left' : 'right'; ctx.fillText(txt, el.x + (v >= 0 ? 6 : -6), el.y); }
            else { ctx.textAlign = 'center'; ctx.textBaseline = v >= 0 ? 'bottom' : 'top'; ctx.fillText(txt, el.x, el.y + (v >= 0 ? -4 : 4)); }
            ctx.restore();
          });
        });
      },
    });
  }
  function mkChart(id, cfg) {
    const el = document.getElementById(id);
    if (!el || !hasChart) { if (el) el.parentElement.innerHTML = '<div class="empty small">Gráfico indisponível.</div>'; return null; }
    const c = new Chart(el, cfg); charts.push(c); return c;
  }
  const moneyTick = v => moneyShort(v);
  const tooltipMoney = { callbacks: { label: c => ' ' + (c.dataset.label ? c.dataset.label + ': ' : '') + money(c.parsed[c.chart.options.indexAxis === 'y' ? 'x' : 'y']) } };
  function barDefaults(extra) {
    return Object.assign({ borderRadius: 4, borderSkipped: 'start', maxBarThickness: 34, borderWidth: 0 }, extra || {});
  }
  function scalesMoney(horizontal) {
    const val = { grid: { color: '#efeee9' }, border: { display: false }, ticks: { callback: moneyTick, maxTicksLimit: horizontal ? 5 : 6, maxRotation: 0 } };
    const cat = { grid: { display: false }, border: { color: '#d9d8d2' }, ticks: { autoSkip: true, maxRotation: 0 } };
    return horizontal ? { x: val, y: cat } : { x: cat, y: val };
  }
  function legendHTML(items) {
    return '<div class="legend">' + items.map(i => `<span><i style="background:${i.color}"></i>${esc(i.label)}</span>`).join('') + '</div>';
  }

  // ---------------------------------------------------------------- Navegação
  function renderNav() {
    const h = location.hash || '#/';
    const item = (href, inner, active) => `<a href="${href}" class="${active ? 'active' : ''}">${inner}</a>`;
    let html = '';
    html += item('#/', '<span class="ico">▦</span>Visão geral', h === '#/' || h === '');
    html += '<div class="nav-label">Plataformas</div>';
    PLATFORMS.forEach(p => {
      html += item('#/p/' + p.id + '/resumo', `<span class="dot" style="background:${p.color}"></span>${p.name}`, h.startsWith('#/p/' + p.id));
    });
    html += '<div class="nav-label">Ferramentas</div>';
    html += item('#/produtos', '<span class="ico">▤</span>Todos os produtos', h === '#/produtos');
    html += item('#/despesas', '<span class="ico">⊖</span>Despesas gerais', h === '#/despesas');
    html += item('#/calc', '<span class="ico">∑</span>Calculadora de preço', h === '#/calc');
    html += item('#/config', '<span class="ico">⚙</span>Configurações', h === '#/config');
    $('#nav').innerHTML = html;
    $('#storeName').textContent = db.settings.storeName || 'Minha Loja';
  }

  function route() {
    destroyCharts();
    renderNav();
    $('#sidebar').classList.remove('open');
    const parts = (location.hash || '#/').replace(/^#\/?/, '').split('/');
    const view = $('#view');
    document.documentElement.style.removeProperty('--pc');
    let title = 'Visão geral';
    if (parts[0] === 'p' && PMAP[parts[1]]) {
      const p = PMAP[parts[1]];
      document.documentElement.style.setProperty('--pc', p.color);
      title = p.name;
      renderPlatform(view, p, parts[2] || 'resumo');
    } else if (parts[0] === 'produtos') { title = 'Todos os produtos'; renderAllProducts(view); }
    else if (parts[0] === 'despesas') { title = 'Despesas gerais'; renderGeneralExpenses(view); }
    else if (parts[0] === 'calc') { title = 'Calculadora'; renderCalc(view); }
    else if (parts[0] === 'config') { title = 'Configurações'; renderConfig(view); }
    else renderDashboard(view);
    $('#mobileTitle').textContent = title;
    document.title = title + ' · Controle de Vendas';
    window.scrollTo(0, 0);
  }
  function rerender() { const y = window.scrollY; route(); window.scrollTo(0, y); }

  function periodControl() {
    const r = getRange();
    let h = '<div class="seg" role="group" aria-label="Período">';
    PERIODS.forEach(([k, l]) => { h += `<button data-act="period" data-k="${k}" class="${period.key === k ? 'on' : ''}">${l}</button>`; });
    h += '</div>';
    if (period.key === 'custom') {
      h += `<input type="date" id="pFrom" value="${r.from}" style="width:auto"> <span class="muted">até</span> <input type="date" id="pTo" value="${r.to}" style="width:auto">`;
    }
    return '<div class="toolbar">' + h + '</div>';
  }

  // ---------------------------------------------------------------- KPIs
  function deltaFoot(cur, prev, isMoney) {
    if (!prev) return '<span class="muted">sem período anterior</span>';
    const d = (cur - prev) / Math.abs(prev);
    const arrow = d >= 0 ? '▲' : '▼';
    return `<span class="${d >= 0 ? 'pos' : 'neg'}">${arrow} ${pct(Math.abs(d))}</span> vs período anterior`;
  }
  function kpiBlock(a, prev) {
    const k = (label, value, foot, extra) => `<div class="kpi ${extra || ''}"><div class="k-label">${label}</div><div class="k-value num">${value}</div><div class="k-foot">${foot || ''}</div></div>`;
    return '<div class="kpis">' +
      k('Faturamento', money(a.revenue), deltaFoot(a.revenue, prev && prev.revenue), 'hl') +
      k('Lucro das vendas', `<span class="${cls(a.profit)}">${money(a.profit)}</span>`, 'margem ' + pct(a.margin)) +
      k('Despesas', money(a.expenses), 'ADS, mensalidades, etc.') +
      k('Lucro líquido', `<span class="${cls(a.net)}">${money(a.net)}</span>`, 'margem líquida ' + pct(a.netMargin), 'hl') +
      k('Pedidos', n2(a.orders), n2(a.units) + ' unidades' + (a.cancelled || a.returned ? ` · ${a.cancelled} canc. · ${a.returned} dev.` : '')) +
      k('Ticket médio', money(a.ticket), 'por pedido') +
      k('Impostos', money(a.taxV), a.revenue ? pct(a.taxV / a.revenue) + ' do faturamento' : '') +
      k('Comissões e taxas', money(a.commV + a.fixed), a.revenue ? pct((a.commV + a.fixed) / a.revenue) + ' do faturamento' : '') +
      k('Frete pago', money(a.ship), a.revenue ? pct(a.ship / a.revenue) + ' do faturamento' : '') +
      k('Custo dos produtos', money(a.cogs + a.packOther), 'produto + embalagem + outros') +
      k('ROI', `<span class="${cls(a.roi)}">${pct(a.roi)}</span>`, 'lucro líquido ÷ custo investido') +
      '</div>';
  }

  // Para onde vai o dinheiro (lista de barras rotuladas)
  function moneyFlowHTML(a) {
    if (!a.revenue) return '<div class="empty small">Sem vendas no período.</div>';
    const rows = [
      ['Custo dos produtos', a.cogs], ['Embalagem e outros', a.packOther], ['Impostos', a.taxV], ['Comissões', a.commV],
      ['Taxas fixas', a.fixed], ['Frete', a.ship], ['Despesas (ADS etc.)', a.expenses],
    ];
    const max = Math.max(...rows.map(r => r[1]), Math.abs(a.net), 1);
    let h = `<div class="small muted" style="margin-bottom:10px">De cada <b>R$ 100,00</b> vendidos:</div>`;
    rows.forEach(([l, v]) => {
      const share = v / a.revenue * 100;
      h += `<div style="margin-bottom:8px"><div class="row small" style="justify-content:space-between"><span>${l}</span><span class="num"><b>${money(share)}</b> <span class="muted">· ${money(v)}</span></span></div>
        <div style="height:8px;background:var(--surface-2);border-radius:4px;margin-top:3px"><div style="height:100%;width:${Math.max(0.5, v / max * 100)}%;background:#8a8984;border-radius:4px"></div></div></div>`;
    });
    const share = a.net / a.revenue * 100;
    h += `<div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border)"><div class="row" style="justify-content:space-between"><b>Sobra para você (lucro líquido)</b><span class="num ${cls(a.net)}"><b>${money(share)}</b> · ${money(a.net)}</span></div>
      <div style="height:10px;background:var(--surface-2);border-radius:5px;margin-top:4px"><div style="height:100%;width:${Math.max(0.5, Math.abs(a.net) / max * 100)}%;background:${a.net >= 0 ? '#0a7d0a' : '#c22f2f'};border-radius:5px"></div></div></div>`;
    return h;
  }

  function alertsHTML(pid) {
    const prods = pid ? productsOf(pid) : db.products;
    const items = [];
    prods.forEach(p => {
      if (p.status === 'pausado') return;
      const c = prodCalc(p); const pl = PMAP[p.platform];
      const tag = pid ? '' : ` <span class="muted">(${pl.name})</span>`;
      if (c.profit < 0) items.push(['bad', '!', `<b>${esc(p.name)}</b>${tag} dá <b>prejuízo</b> de ${money(-c.profit)} por unidade. Preço mínimo: ${money(c.breakEven)}.`]);
      else if (c.margin < 0.08) items.push(['warn', '!', `<b>${esc(p.name)}</b>${tag} tem margem baixa (${pct(c.margin)}). Para 15% de margem, venda por ${money(c.priceFor(0.15))}.`]);
      const st = +p.stock || 0, min = +p.minStock || 0;
      if (st <= 0) items.push(['bad', '▣', `<b>${esc(p.name)}</b>${tag} está <b>sem estoque</b>.`]);
      else if (min && st <= min) items.push(['warn', '▣', `<b>${esc(p.name)}</b>${tag} com estoque baixo: ${st} un. (mínimo ${min}).`]);
    });
    if (!items.length) return prods.length ? '<div class="alert good"><span class="a-ico">✓</span>Tudo certo: nenhum produto com prejuízo ou estoque baixo.</div>' : '<div class="muted small">Cadastre produtos para ver alertas.</div>';
    items.sort((a, b) => (a[0] === 'bad' ? 0 : 1) - (b[0] === 'bad' ? 0 : 1));
    return '<div class="alerts">' + items.slice(0, 12).map(i => `<div class="alert ${i[0]}"><span class="a-ico">${i[1]}</span><div>${i[2]}</div></div>`).join('') +
      (items.length > 12 ? `<div class="muted small">+ ${items.length - 12} alertas</div>` : '') + '</div>';
  }

  function timeSeries(sales, r) {
    const b = buckets(r);
    const idx = Object.fromEntries(b.list.map((x, i) => [x.key, i]));
    const rev = b.list.map(() => 0), prof = b.list.map(() => 0), orders = b.list.map(() => 0);
    sales.forEach(s => {
      const i = idx[b.keyOf(s.date)]; if (i == null) return;
      const c = saleCalc(s); rev[i] += c.revenue; prof[i] += c.profit; if (c.counts) orders[i]++;
    });
    return { b, rev, prof, orders };
  }

  // ---------------------------------------------------------------- Dashboard
  function renderDashboard(view) {
    const r = getRange(), pr = previousRange(r);
    const sales = salesOf(null, r);
    const a = aggregate(sales, expensesOf(null, r));
    const prev = aggregate(salesOf(null, pr), expensesOf(null, pr));
    const perPlat = PLATFORMS.map(p => ({ p, a: aggregate(salesOf(p.id, r), expensesOf(p.id, r)) }));
    const generalExp = expensesOf('geral', r).reduce((s, e) => s + (+e.amount || 0), 0);
    const empty = !db.products.length && !db.sales.length;

    let h = `<div class="topbar"><div class="page-title"><div><h1>Visão geral</h1><div class="sub">${periodLabel()}</div></div></div>${periodControl()}</div>`;
    if (empty) {
      h += `<div class="card mt" style="margin-bottom:16px"><div class="empty"><div class="big">🛒</div><h2 style="margin:0">Bem-vindo ao seu controle de vendas</h2>
        <p>Comece cadastrando seus produtos em cada plataforma, ou carregue dados de exemplo para ver como tudo funciona.</p>
        <div class="row" style="justify-content:center">${PLATFORMS.map(p => `<a class="btn" href="#/p/${p.id}/produtos"><span class="pill"><span class="pdot" style="background:${p.color}"></span>${p.name}</span></a>`).join('')}</div>
        <div class="mt"><button class="btn primary" data-act="sample">Carregar dados de exemplo</button></div></div></div>`;
    }
    h += kpiBlock(a, prev);
    h += `<div class="grid g3">
      <div class="card"><h3>Faturamento e lucro</h3><div class="card-sub">${r.from === r.to ? '' : 'Por ' + (buckets(r).mode === 'day' ? 'dia' : 'mês')}, todas as plataformas</div>
        ${legendHTML([{ label: 'Faturamento', color: NEUTRAL_A }, { label: 'Lucro das vendas', color: NEUTRAL_B }])}<div class="chart-box"><canvas id="chTime"></canvas></div></div>
      <div class="card"><h3>Faturamento por plataforma</h3><div class="card-sub">Participação no período</div><div class="chart-box"><canvas id="chPlatRev"></canvas></div></div>
    </div>`;
    h += `<div class="grid g2">
      <div class="card"><h3>Evolução por plataforma</h3><div class="card-sub">Faturamento</div>${legendHTML(PLATFORMS.map(p => ({ label: p.name, color: p.color })))}<div class="chart-box"><canvas id="chPlatLine"></canvas></div></div>
      <div class="card"><h3>Lucro líquido por plataforma</h3><div class="card-sub">Lucro das vendas − despesas da plataforma</div><div class="chart-box"><canvas id="chPlatProfit"></canvas></div></div>
    </div>`;
    h += `<div class="card" style="margin-bottom:16px"><h3>Comparativo entre plataformas</h3><div class="card-sub">${periodLabel()}</div><div class="table-wrap" style="box-shadow:none">
      <table><thead><tr><th>Plataforma</th><th class="r">Pedidos</th><th class="r">Unid.</th><th class="r">Faturamento</th><th class="r">Ticket médio</th><th class="r">Impostos</th><th class="r">Comissões/taxas</th><th class="r">Frete</th><th class="r">Custo produtos</th><th class="r">Lucro vendas</th><th class="r">Margem</th><th class="r">Despesas</th><th class="r">Lucro líquido</th></tr></thead><tbody>
      ${perPlat.map(({ p, a: x }) => `<tr><td><a href="#/p/${p.id}/resumo" style="text-decoration:none;color:inherit"><span class="pill"><span class="pdot" style="background:${p.color}"></span>${p.name}</span></a></td>
        <td class="r num">${x.orders}</td><td class="r num">${x.units}</td><td class="r num">${money(x.revenue)}</td><td class="r num">${money(x.ticket)}</td><td class="r num">${money(x.taxV)}</td><td class="r num">${money(x.commV + x.fixed)}</td><td class="r num">${money(x.ship)}</td><td class="r num">${money(x.cogs + x.packOther)}</td>
        <td class="r num ${cls(x.profit)}">${money(x.profit)}</td><td class="r num">${pct(x.margin)}</td><td class="r num">${money(x.expenses)}</td><td class="r num ${cls(x.net)}"><b>${money(x.net)}</b></td></tr>`).join('')}
      ${generalExp ? `<tr><td class="muted">Despesas gerais</td><td colspan="10"></td><td class="r num">${money(generalExp)}</td><td class="r num neg">${money(-generalExp)}</td></tr>` : ''}
      </tbody><tfoot><tr><td>Total</td><td class="r num">${a.orders}</td><td class="r num">${a.units}</td><td class="r num">${money(a.revenue)}</td><td class="r num">${money(a.ticket)}</td><td class="r num">${money(a.taxV)}</td><td class="r num">${money(a.commV + a.fixed)}</td><td class="r num">${money(a.ship)}</td><td class="r num">${money(a.cogs + a.packOther)}</td><td class="r num ${cls(a.profit)}">${money(a.profit)}</td><td class="r num">${pct(a.margin)}</td><td class="r num">${money(a.expenses)}</td><td class="r num ${cls(a.net)}">${money(a.net)}</td></tr></tfoot></table></div></div>`;
    h += `<div class="grid g2">
      <div class="card"><h3>Top 10 produtos por lucro</h3><div class="card-sub">Cor = plataforma</div>${legendHTML(PLATFORMS.map(p => ({ label: p.name, color: p.color })))}<div class="chart-box tall"><canvas id="chTop"></canvas></div></div>
      <div class="card"><h3>Para onde vai o dinheiro</h3><div class="card-sub">Composição do faturamento no período</div>${moneyFlowHTML(a)}</div>
    </div>`;
    h += `<div class="grid g2">
      <div class="card"><h3>Alertas</h3><div class="card-sub">Prejuízo, margem baixa e estoque</div>${alertsHTML(null)}</div>
      <div class="card"><h3>Estoque</h3><div class="card-sub">Valor parado em mercadoria</div>${stockSummaryHTML(db.products)}</div>
    </div>`;
    view.innerHTML = h;

    // Charts
    const ts = timeSeries(sales, r);
    mkChart('chTime', { type: 'bar', data: { labels: ts.b.list.map(x => x.label), datasets: [
      Object.assign({ label: 'Faturamento', data: ts.rev, backgroundColor: NEUTRAL_A }, barDefaults()),
      Object.assign({ label: 'Lucro das vendas', data: ts.prof, backgroundColor: NEUTRAL_B }, barDefaults()),
    ] }, options: { scales: scalesMoney(false), plugins: { tooltip: Object.assign({ mode: 'index', intersect: false }, tooltipMoney) }, datasets: { bar: { categoryPercentage: 0.75, barPercentage: 0.9 } } } });

    const totalRev = perPlat.reduce((s, x) => s + x.a.revenue, 0);
    mkChart('chPlatRev', { type: 'bar', data: { labels: PLATFORMS.map(p => p.name), datasets: [Object.assign({ label: 'Faturamento', data: perPlat.map(x => x.a.revenue), backgroundColor: PLATFORMS.map(p => p.color) }, barDefaults({ maxBarThickness: 28 }))] },
      options: { indexAxis: 'y', layout: { padding: { right: 90 } }, scales: scalesMoney(true), plugins: { tooltip: tooltipMoney, valueLabels: { enabled: true, format: v => moneyShort(v) + (totalRev ? ' · ' + pct(v / totalRev, 0) : '') } } } });

    const lines = PLATFORMS.map(p => {
      const t = timeSeries(salesOf(p.id, r), r);
      return { label: p.name, data: t.rev, borderColor: p.color, backgroundColor: p.color, borderWidth: 2, pointRadius: t.rev.length > 40 ? 0 : 3, pointHoverRadius: 5, tension: 0.25 };
    });
    mkChart('chPlatLine', { type: 'line', data: { labels: ts.b.list.map(x => x.label), datasets: lines },
      options: { interaction: { mode: 'index', intersect: false }, scales: scalesMoney(false), plugins: { tooltip: tooltipMoney } } });

    mkChart('chPlatProfit', { type: 'bar', data: { labels: PLATFORMS.map(p => p.name), datasets: [Object.assign({ label: 'Lucro líquido', data: perPlat.map(x => x.a.net), backgroundColor: PLATFORMS.map(p => p.color) }, barDefaults({ maxBarThickness: 48 }))] },
      options: { layout: { padding: { top: 20 } }, scales: scalesMoney(false), plugins: { tooltip: tooltipMoney, valueLabels: { enabled: true, format: v => moneyShort(v) } } } });

    topProductsChart('chTop', sales, null);
  }

  function stockSummaryHTML(prods) {
    if (!prods.length) return '<div class="muted small">Sem produtos.</div>';
    let units = 0, val = 0, rev = 0, prof = 0;
    prods.forEach(p => { const c = prodCalc(p); units += +p.stock || 0; val += c.stockValue; rev += c.stockRevenue; prof += c.stockProfit; });
    const row = (l, v, c) => `<div class="pv-row"><span class="lbl">${l}</span><b class="num ${c || ''}">${v}</b></div>`;
    return row('Unidades em estoque', n2(units)) + row('Valor em custo', money(val)) + row('Se vender tudo, fatura', money(rev)) + row('Lucro potencial do estoque', money(prof), cls(prof)) +
      `<div class="pv-row"><span class="lbl">Produtos cadastrados</span><b>${prods.length} (${prods.filter(p => p.status !== 'pausado').length} ativos)</b></div>`;
  }

  function topProductsChart(canvasId, sales, pid) {
    const map = {};
    sales.forEach(s => {
      const c = saleCalc(s); const key = s.productId || s.productName;
      if (!map[key]) map[key] = { name: s.productName || (productById(s.productId) || {}).name || 'Produto', platform: s.platform, profit: 0, revenue: 0, units: 0 };
      map[key].profit += c.profit; map[key].revenue += c.revenue; map[key].units += c.qty;
    });
    const list = Object.values(map).sort((a, b) => b.profit - a.profit).slice(0, 10);
    const el = document.getElementById(canvasId);
    if (!list.length) { if (el) el.parentElement.innerHTML = '<div class="empty small">Sem vendas no período.</div>'; return; }
    const trunc = s => s.length > 26 ? s.slice(0, 25) + '…' : s;
    mkChart(canvasId, { type: 'bar', data: { labels: list.map(x => trunc(x.name)), datasets: [Object.assign({ label: 'Lucro', data: list.map(x => x.profit), backgroundColor: list.map(x => PMAP[x.platform].color) }, barDefaults({ maxBarThickness: 22 }))] },
      options: { indexAxis: 'y', layout: { padding: { right: 70 } }, scales: scalesMoney(true), plugins: {
        tooltip: { callbacks: { title: c => list[c[0].dataIndex].name + (pid ? '' : ' · ' + PMAP[list[c[0].dataIndex].platform].name), label: c => { const x = list[c.dataIndex]; return [' Lucro: ' + money(x.profit), ' Faturamento: ' + money(x.revenue), ' Unidades: ' + x.units]; } } },
        valueLabels: { enabled: true, format: v => moneyShort(v) } } } });
  }

  // ---------------------------------------------------------------- Plataforma
  const TABS = [['resumo', 'Resumo'], ['produtos', 'Produtos'], ['vendas', 'Vendas'], ['despesas', 'Despesas'], ['config', 'Taxas e configurações']];
  function renderPlatform(view, p, tab) {
    const prods = productsOf(p.id);
    let h = `<div class="topbar"><div class="page-title"><div class="plat-badge">${p.short}</div><div><h1>${p.name}</h1><div class="sub">${prods.length} produtos · ${tab === 'resumo' || tab === 'vendas' || tab === 'despesas' ? periodLabel() : 'cadastro'}</div></div></div>
      <div class="toolbar"><button class="btn" data-act="new-product" data-pid="${p.id}">+ Produto</button><button class="btn plat" data-act="new-sale" data-pid="${p.id}">+ Registrar venda</button></div></div>`;
    h += '<div class="tabs">' + TABS.map(([k, l]) => `<a href="#/p/${p.id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('') + '</div>';
    view.innerHTML = h + '<div id="tabBody"></div>';
    const body = $('#tabBody');
    if (tab === 'produtos') renderProductsTab(body, p);
    else if (tab === 'vendas') renderSalesTab(body, p);
    else if (tab === 'despesas') renderExpensesTab(body, p.id);
    else if (tab === 'config') renderPlatformConfig(body, p);
    else renderPlatformSummary(body, p);
  }

  function renderPlatformSummary(body, p) {
    const r = getRange(), pr = previousRange(r);
    const sales = salesOf(p.id, r);
    const a = aggregate(sales, expensesOf(p.id, r));
    const prev = aggregate(salesOf(p.id, pr), expensesOf(p.id, pr));
    let h = `<div class="row" style="margin-bottom:14px">${periodControl()}</div>`;
    h += kpiBlock(a, prev);
    h += `<div class="grid g3">
      <div class="card"><h3>Faturamento e lucro</h3><div class="card-sub">Por ${buckets(r).mode === 'day' ? 'dia' : 'mês'}</div>${legendHTML([{ label: 'Faturamento', color: p.color }, { label: 'Lucro das vendas', color: NEUTRAL_B }])}<div class="chart-box"><canvas id="chTime"></canvas></div></div>
      <div class="card"><h3>Para onde vai o dinheiro</h3><div class="card-sub">Composição do faturamento</div>${moneyFlowHTML(a)}</div>
    </div>`;
    h += `<div class="grid g2">
      <div class="card"><h3>Top 10 produtos por lucro</h3><div class="card-sub">No período</div><div class="chart-box tall"><canvas id="chTop"></canvas></div></div>
      <div class="card"><h3>Margem de lucro por produto</h3><div class="card-sub">Margem unitária no preço atual (cadastro)</div><div class="chart-box tall"><canvas id="chMargin"></canvas></div></div>
    </div>`;
    h += `<div class="grid g2">
      <div class="card"><h3>Pedidos por dia da semana</h3><div class="card-sub">Descubra seus melhores dias</div><div class="chart-box short"><canvas id="chWeek"></canvas></div></div>
      <div class="card"><h3>Alertas</h3><div class="card-sub">Prejuízo, margem baixa e estoque</div>${alertsHTML(p.id)}</div>
    </div>`;
    h += `<div class="grid g2"><div class="card"><h3>Estoque ${p.name}</h3><div class="card-sub">Valor parado em mercadoria</div>${stockSummaryHTML(productsOf(p.id))}</div>
      <div class="card"><h3>Taxas atuais</h3><div class="card-sub">Usadas como padrão em novos produtos</div>${platformRatesHTML(p)}<div class="mt"><a class="btn sm" href="#/p/${p.id}/config">Editar taxas</a></div></div></div>`;
    body.innerHTML = h;

    const ts = timeSeries(sales, r);
    mkChart('chTime', { type: 'bar', data: { labels: ts.b.list.map(x => x.label), datasets: [
      Object.assign({ label: 'Faturamento', data: ts.rev, backgroundColor: p.color }, barDefaults()),
      Object.assign({ label: 'Lucro das vendas', data: ts.prof, backgroundColor: NEUTRAL_B }, barDefaults()),
    ] }, options: { scales: scalesMoney(false), plugins: { tooltip: Object.assign({ mode: 'index', intersect: false }, tooltipMoney) }, datasets: { bar: { categoryPercentage: 0.75, barPercentage: 0.9 } } } });
    topProductsChart('chTop', sales, p.id);

    const prods = productsOf(p.id).filter(x => x.status !== 'pausado').map(x => ({ x, c: prodCalc(x) })).sort((a, b) => b.c.margin - a.c.margin).slice(0, 15);
    if (prods.length) {
      const trunc = s => s.length > 24 ? s.slice(0, 23) + '…' : s;
      mkChart('chMargin', { type: 'bar', data: { labels: prods.map(o => trunc(o.x.name)), datasets: [Object.assign({ label: 'Margem', data: prods.map(o => +(o.c.margin * 100).toFixed(1)), backgroundColor: prods.map(o => o.c.margin < 0 ? '#c22f2f' : p.color) }, barDefaults({ maxBarThickness: 20 }))] },
        options: { indexAxis: 'y', layout: { padding: { right: 50 } }, scales: { x: { grid: { color: '#efeee9' }, border: { display: false }, ticks: { callback: v => v + '%' } }, y: { grid: { display: false } } },
          plugins: { tooltip: { callbacks: { title: c => prods[c[0].dataIndex].x.name, label: c => { const o = prods[c.dataIndex]; return [' Margem: ' + pct(o.c.margin), ' Lucro/un: ' + money(o.c.profit), ' Preço: ' + money(o.c.price)]; } } }, valueLabels: { enabled: true, format: v => String(v).replace('.', ',') + '%' } } } });
    } else { const el = $('#chMargin'); el.parentElement.innerHTML = '<div class="empty small">Cadastre produtos para ver as margens.</div>'; }

    const wk = [0, 0, 0, 0, 0, 0, 0];
    sales.forEach(s => { if (saleCalc(s).counts) wk[parseISO(s.date).getDay()]++; });
    mkChart('chWeek', { type: 'bar', data: { labels: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'], datasets: [Object.assign({ label: 'Pedidos', data: wk, backgroundColor: p.color }, barDefaults())] },
      options: { layout: { padding: { top: 18 } }, scales: { x: { grid: { display: false } }, y: { grid: { color: '#efeee9' }, border: { display: false }, ticks: { precision: 0 } } }, plugins: { valueLabels: { enabled: true, skipZero: true } } } });
  }

  function platformRatesHTML(p) {
    const s = db.settings.platforms[p.id];
    const row = (l, v) => `<div class="pv-row"><span class="lbl">${l}</span><b>${v}</b></div>`;
    return row('Comissão', n2(s.commission) + '%') + row('Taxa fixa por unidade', money(s.fixedFee) + (s.fixedFeeBelow ? ` (só abaixo de ${money(s.fixedFeeBelow)})` : '')) + row('Imposto', n2(s.tax) + '%') + row('Frete padrão pago por você', money(s.shipping));
  }

  // ---------------------------------------------------------------- Tabela de produtos
  const ui = { sort: {}, q: {}, status: {} };
  function sortList(list, tableKey, getters) {
    const s = ui.sort[tableKey]; if (!s || !getters[s.key]) return list;
    const g = getters[s.key];
    return list.slice().sort((a, b) => { const x = g(a), y = g(b); return (typeof x === 'string' ? x.localeCompare(y) : x - y) * (s.dir === 'asc' ? 1 : -1); });
  }
  function th(tableKey, key, label, right) {
    const s = ui.sort[tableKey]; const arrow = s && s.key === key ? (s.dir === 'asc' ? ' ↑' : ' ↓') : '';
    return `<th class="sortable ${right ? 'r' : ''}" data-act="sort" data-t="${tableKey}" data-k="${key}">${label}${arrow}</th>`;
  }

  function renderProductsTab(body, p) {
    body.innerHTML = `<div class="row" style="margin-bottom:12px"><input type="text" class="search" placeholder="Buscar produto, SKU, categoria…" data-act="search" data-t="prod-${p.id}" value="${esc(ui.q['prod-' + p.id] || '')}">
      <span class="spacer"></span><span class="muted small">Vendidos e lucro referem-se a: ${periodLabel()}</span></div><div id="tblWrap"></div>
      <details class="help mt"><summary>Como os valores são calculados?</summary><p><b>Custo total</b> = custo do produto + imposto + comissão + taxa fixa + frete + embalagem + outros. <b>Lucro/un.</b> = preço de venda − custo total. <b>Margem</b> = lucro ÷ preço de venda. <b>Markup</b> = (preço − custo do produto) ÷ custo do produto. <b>ROI</b> = lucro ÷ (custo + embalagem + outros). <b>Preço mínimo</b> = preço em que o lucro é zero.</p></details>`;
    renderProductsTable(p.id);
  }
  function renderProductsTable(pid) {
    const tKey = pid ? 'prod-' + pid : 'prod-all';
    const q = (ui.q[tKey] || '').toLowerCase();
    const r = getRange();
    const soldMap = {};
    db.sales.filter(s => inRange(s.date, r)).forEach(s => { const c = saleCalc(s); const m = soldMap[s.productId] || (soldMap[s.productId] = { units: 0, profit: 0 }); m.units += c.qty; m.profit += c.profit; });
    let list = (pid ? productsOf(pid) : db.products.slice()).filter(x => !q || [x.name, x.sku, x.category, x.supplier].join(' ').toLowerCase().includes(q));
    const rows = list.map(x => ({ x, c: prodCalc(x), sold: soldMap[x.id] || { units: 0, profit: 0 } }));
    const sorted = sortList(rows, tKey, {
      name: o => o.x.name || '', stock: o => +o.x.stock || 0, cost: o => o.c.cost, price: o => o.c.price, profit: o => o.c.profit, margin: o => o.c.margin,
      markup: o => o.c.markup, roi: o => o.c.roi, sold: o => o.sold.units, sprofit: o => o.sold.profit, total: o => o.c.totalCost, platform: o => o.x.platform,
    });
    const wrap = $('#tblWrap');
    if (!list.length) {
      wrap.innerHTML = `<div class="card"><div class="empty"><div class="big">📦</div><p>${q ? 'Nenhum produto encontrado.' : 'Nenhum produto cadastrado ainda.'}</p>${pid ? `<button class="btn plat" data-act="new-product" data-pid="${pid}">+ Cadastrar primeiro produto</button>` : ''}</div></div>`;
      return;
    }
    let tot = { stockVal: 0, units: 0, sold: 0, sprofit: 0, potential: 0 };
    let h = `<div class="table-wrap"><table><thead><tr>${th(tKey, 'name', 'Produto')}${pid ? '' : th(tKey, 'platform', 'Plataforma')}<th>Status</th>${th(tKey, 'stock', 'Estoque', 1)}${th(tKey, 'cost', 'Custo', 1)}${th(tKey, 'price', 'Preço venda', 1)}<th class="r">Imposto</th><th class="r">Comissão + taxa</th><th class="r">Frete</th><th class="r">Emb. + outros</th>${th(tKey, 'total', 'Custo total', 1)}${th(tKey, 'profit', 'Lucro/un.', 1)}${th(tKey, 'margin', 'Margem', 1)}${th(tKey, 'markup', 'Markup', 1)}${th(tKey, 'roi', 'ROI', 1)}<th class="r">Preço mín.</th>${th(tKey, 'sold', 'Vendidos', 1)}${th(tKey, 'sprofit', 'Lucro período', 1)}<th></th></tr></thead><tbody>`;
    sorted.forEach(({ x, c, sold }) => {
      const st = +x.stock || 0, min = +x.minStock || 0;
      const stPill = x.status === 'pausado' ? '<span class="pill">Pausado</span>' : st <= 0 ? '<span class="pill bad">Sem estoque</span>' : (min && st <= min) ? '<span class="pill warn">Estoque baixo</span>' : '<span class="pill good">Ativo</span>';
      tot.stockVal += c.stockValue; tot.units += st; tot.sold += sold.units; tot.sprofit += sold.profit; tot.potential += c.stockProfit;
      const pl = PMAP[x.platform];
      h += `<tr><td><span class="prod-name" title="${esc(x.name)}">${esc(x.name)}</span><span class="prod-sku">${esc([x.sku, x.category].filter(Boolean).join(' · ') || '—')}</span></td>
        ${pid ? '' : `<td><span class="pill"><span class="pdot" style="background:${pl.color}"></span>${pl.name}</span></td>`}
        <td>${stPill}</td><td class="r num">${n2(st)}</td><td class="r num">${money(c.cost)}</td><td class="r num"><b>${money(c.price)}</b></td>
        <td class="r num">${money(c.taxV)}<div class="prod-sku">${n2(x.tax)}%</div></td><td class="r num">${money(c.commV + c.fixed)}<div class="prod-sku">${n2(x.commission)}% + ${money(c.fixed)}</div></td>
        <td class="r num">${money(c.ship)}</td><td class="r num">${money(c.pack + c.other)}</td><td class="r num">${money(c.totalCost)}</td>
        <td class="r num ${cls(c.profit)}"><b>${money(c.profit)}</b></td><td class="r num ${cls(c.margin)}">${pct(c.margin)}</td><td class="r num">${pct(c.markup, 0)}</td><td class="r num">${pct(c.roi, 0)}</td>
        <td class="r num">${isFinite(c.breakEven) ? money(c.breakEven) : '—'}</td><td class="r num">${sold.units}</td><td class="r num ${cls(sold.profit)}">${money(sold.profit)}</td>
        <td><div class="actions"><button class="btn sm" data-act="new-sale" data-pid="${x.platform}" data-prod="${x.id}" title="Registrar venda">Vender</button><button class="icon-btn" data-act="edit-product" data-id="${x.id}" title="Editar">✎</button><button class="icon-btn" data-act="copy-product" data-id="${x.id}" title="Duplicar / copiar para outra plataforma">⧉</button><button class="icon-btn danger" data-act="del-product" data-id="${x.id}" title="Excluir">🗑</button></div></td></tr>`;
    });
    const cols = pid ? 0 : 1;
    h += `</tbody><tfoot><tr><td colspan="${2 + cols}">${list.length} produtos</td><td class="r num">${n2(tot.units)}</td><td class="r num" colspan="2">${money(tot.stockVal)} <span class="muted small">em estoque</span></td><td colspan="6" class="r small muted">Lucro potencial do estoque: <span class="${cls(tot.potential)}">${money(tot.potential)}</span></td><td colspan="3"></td><td class="r num">${tot.sold}</td><td class="r num ${cls(tot.sprofit)}">${money(tot.sprofit)}</td><td></td></tr></tfoot></table></div>`;
    wrap.innerHTML = h;
  }

  function renderAllProducts(view) {
    view.innerHTML = `<div class="topbar"><div class="page-title"><div><h1>Todos os produtos</h1><div class="sub">${db.products.length} produtos em ${PLATFORMS.length} plataformas</div></div></div>
      <div class="toolbar"><button class="btn primary" data-act="new-product" data-pid="${PLATFORMS[0].id}">+ Produto</button></div></div>
      <div class="row" style="margin-bottom:12px"><input type="text" class="search" placeholder="Buscar produto, SKU, categoria…" data-act="search" data-t="prod-all" value="${esc(ui.q['prod-all'] || '')}"><span class="spacer"></span><span class="muted small">Vendidos e lucro: ${periodLabel()}</span></div><div id="tblWrap"></div>`;
    renderProductsTable(null);
  }

  // ---------------------------------------------------------------- Vendas
  function renderSalesTab(body, p) {
    const tKey = 'sale-' + p.id;
    body.innerHTML = `<div class="row" style="margin-bottom:12px">${periodControl()}</div>
      <div class="row" style="margin-bottom:12px"><input type="text" class="search" placeholder="Buscar produto ou nº do pedido…" data-act="search" data-t="${tKey}" value="${esc(ui.q[tKey] || '')}">
      <select data-act="status-filter" data-t="${tKey}" style="width:auto"><option value="">Todos os status</option>${Object.entries(SALE_STATUS).map(([k, v]) => `<option value="${k}" ${ui.status[tKey] === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select>
      <span class="spacer"></span><button class="btn sm" data-act="export-sales" data-pid="${p.id}">Exportar CSV</button></div><div id="tblWrap"></div>`;
    renderSalesTable(p.id);
  }
  function renderSalesTable(pid) {
    const tKey = 'sale-' + pid;
    const q = (ui.q[tKey] || '').toLowerCase(); const stf = ui.status[tKey] || '';
    const r = getRange();
    const list = salesOf(pid, r).filter(s => (!stf || s.status === stf) && (!q || [s.productName, s.orderId, s.notes].join(' ').toLowerCase().includes(q)));
    const rows = list.map(s => ({ s, c: saleCalc(s) }));
    if (!ui.sort[tKey]) ui.sort[tKey] = { key: 'date', dir: 'desc' };
    const sorted = sortList(rows, tKey, { date: o => o.s.date + (o.s.createdAt || ''), product: o => o.s.productName || '', qty: o => +o.s.qty, revenue: o => o.c.revenue, profit: o => o.c.profit, margin: o => o.c.margin });
    const wrap = $('#tblWrap');
    if (!list.length) {
      wrap.innerHTML = `<div class="card"><div class="empty"><div class="big">🧾</div><p>Nenhuma venda neste período${q || stf ? ' com esse filtro' : ''}.</p><button class="btn plat" data-act="new-sale" data-pid="${pid}">+ Registrar venda</button></div></div>`;
      return;
    }
    const a = aggregate(list);
    let h = `<div class="table-wrap"><table><thead><tr>${th(tKey, 'date', 'Data')}<th>Pedido</th>${th(tKey, 'product', 'Produto')}${th(tKey, 'qty', 'Qtd', 1)}<th class="r">Preço un.</th><th class="r">Desconto</th>${th(tKey, 'revenue', 'Receita', 1)}<th class="r">Custo prod.</th><th class="r">Imposto</th><th class="r">Comissão + taxa</th><th class="r">Frete</th>${th(tKey, 'profit', 'Lucro', 1)}${th(tKey, 'margin', 'Margem', 1)}<th>Status</th><th></th></tr></thead><tbody>`;
    sorted.forEach(({ s, c }) => {
      const st = SALE_STATUS[s.status] || SALE_STATUS.entregue;
      h += `<tr><td class="num">${fmtDate(s.date)}</td><td class="muted">${esc(s.orderId || '—')}</td><td><span class="prod-name" title="${esc(s.productName)}">${esc(s.productName)}</span>${s.notes ? `<span class="prod-sku">${esc(s.notes)}</span>` : ''}</td>
        <td class="r num">${n2(s.qty)}</td><td class="r num">${money(s.unitPrice)}</td><td class="r num">${s.discount ? money(s.discount) : '—'}</td><td class="r num"><b>${money(c.revenue)}</b></td>
        <td class="r num">${money(c.cogs + c.packOther)}</td><td class="r num">${money(c.taxV)}</td><td class="r num">${money(c.commV + c.fixed)}</td><td class="r num">${money(c.ship)}</td>
        <td class="r num ${cls(c.profit)}"><b>${money(c.profit)}</b></td><td class="r num">${c.counts ? pct(c.margin) : '—'}</td><td><span class="pill ${st.cls}">${st.label}</span></td>
        <td><div class="actions"><button class="icon-btn" data-act="edit-sale" data-id="${s.id}" title="Editar">✎</button><button class="icon-btn" data-act="dup-sale" data-id="${s.id}" title="Repetir venda">⧉</button><button class="icon-btn danger" data-act="del-sale" data-id="${s.id}" title="Excluir">🗑</button></div></td></tr>`;
    });
    h += `</tbody><tfoot><tr><td colspan="3">${a.orders} pedidos válidos</td><td class="r num">${a.units}</td><td></td><td class="r num">${money(a.discount)}</td><td class="r num">${money(a.revenue)}</td><td class="r num">${money(a.cogs + a.packOther)}</td><td class="r num">${money(a.taxV)}</td><td class="r num">${money(a.commV + a.fixed)}</td><td class="r num">${money(a.ship)}</td><td class="r num ${cls(a.profit)}">${money(a.profit)}</td><td class="r num">${pct(a.margin)}</td><td colspan="2"></td></tr></tfoot></table></div>`;
    wrap.innerHTML = h;
  }

  // ---------------------------------------------------------------- Despesas
  function renderExpensesTab(body, pid) {
    const r = getRange();
    const list = expensesOf(pid, r).slice().sort((a, b) => b.date.localeCompare(a.date));
    const total = list.reduce((s, e) => s + (+e.amount || 0), 0);
    const byCat = {};
    list.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + (+e.amount || 0); });
    let h = `<div class="row" style="margin-bottom:12px">${periodControl()}<span class="spacer"></span><button class="btn ${pid === 'geral' ? 'primary' : 'plat'}" data-act="new-expense" data-pid="${pid}">+ Despesa</button></div>`;
    h += `<div class="grid g3"><div>`;
    if (!list.length) h += `<div class="card"><div class="empty"><div class="big">💸</div><p>Nenhuma despesa no período.</p><p class="small muted">Registre gastos com anúncios (ADS), mensalidade da plataforma, embalagens, etc. Elas são descontadas do lucro líquido.</p></div></div>`;
    else {
      h += `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th class="r">Valor</th><th></th></tr></thead><tbody>`;
      list.forEach(e => { h += `<tr><td class="num">${fmtDate(e.date)}</td><td>${esc(e.category)}</td><td>${esc(e.description || '—')}</td><td class="r num"><b>${money(e.amount)}</b></td><td><div class="actions"><button class="icon-btn" data-act="edit-expense" data-id="${e.id}">✎</button><button class="icon-btn danger" data-act="del-expense" data-id="${e.id}">🗑</button></div></td></tr>`; });
      h += `</tbody><tfoot><tr><td colspan="3">Total</td><td class="r num">${money(total)}</td><td></td></tr></tfoot></table></div>`;
    }
    h += `</div><div class="card"><h3>Por categoria</h3><div class="card-sub">${periodLabel()}</div>${Object.keys(byCat).length ? Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="pv-row"><span class="lbl">${esc(k)}</span><b class="num">${money(v)} <span class="muted small">${pct(v / total, 0)}</span></b></div>`).join('') + `<div class="pv-row sep total"><span>Total</span><span class="num">${money(total)}</span></div>` : '<div class="muted small">—</div>'}</div></div>`;
    body.innerHTML = h;
  }
  function renderGeneralExpenses(view) {
    view.innerHTML = `<div class="topbar"><div class="page-title"><div><h1>Despesas gerais</h1><div class="sub">Gastos que não são de uma plataforma específica (contador, ERP, funcionários…). ${periodLabel()}</div></div></div></div><div id="tabBody"></div>`;
    renderExpensesTab($('#tabBody'), 'geral');
  }

  // ---------------------------------------------------------------- Config. da plataforma
  function renderPlatformConfig(body, p) {
    const s = db.settings.platforms[p.id];
    body.innerHTML = `<div class="grid g2"><div class="card"><h3>Taxas padrão — ${p.name}</h3><div class="card-sub">Preenchidas automaticamente ao cadastrar produtos e vendas. Confira no painel do vendedor: as taxas mudam por categoria e tipo de anúncio.</div>
      <form id="platCfg"><div class="fgrid" style="grid-template-columns:1fr 1fr">
        <label class="field">Comissão da plataforma (%)<input type="text" inputmode="decimal" name="commission" value="${fmtInput(s.commission)}"></label>
        <label class="field">Taxa fixa por unidade (R$)<input type="text" inputmode="decimal" name="fixedFee" value="${fmtInput(s.fixedFee)}"></label>
        <label class="field">Cobrar taxa fixa só abaixo de (R$)<input type="text" inputmode="decimal" name="fixedFeeBelow" value="${fmtInput(s.fixedFeeBelow)}"><span class="hint">0 = cobra sempre</span></label>
        <label class="field">Imposto (%)<input type="text" inputmode="decimal" name="tax" value="${fmtInput(s.tax)}"><span class="hint">Ex.: alíquota do Simples Nacional</span></label>
        <label class="field">Frete padrão pago por você (R$/un.)<input type="text" inputmode="decimal" name="shipping" value="${fmtInput(s.shipping)}"></label>
      </div><div class="row mt"><button class="btn plat" type="submit">Salvar taxas</button><button class="btn" type="button" data-act="apply-rates" data-pid="${p.id}">Aplicar a todos os produtos da ${p.name}</button><button class="btn ghost" type="button" data-act="reset-rates" data-pid="${p.id}">Restaurar padrão</button></div></form></div>
      <div class="card"><h3>Dicas para ${p.name}</h3><div class="card-sub">Valores de referência — confirme sempre no painel</div>${platformTips(p.id)}</div></div>`;
    $('#platCfg').addEventListener('submit', e => {
      e.preventDefault(); const f = new FormData(e.target);
      ['commission', 'fixedFee', 'fixedFeeBelow', 'tax', 'shipping'].forEach(k => { s[k] = parseNum(f.get(k)); });
      save(); toast('Taxas salvas'); rerender();
    });
  }
  function platformTips(id) {
    const tips = {
      amazon: ['Comissão varia por categoria (em geral entre 8% e 15%).', 'Com o DBA/FBA, inclua o custo de logística no campo "Frete" do produto.', 'Plano Profissional tem mensalidade: registre em Despesas.'],
      shopee: ['Comissão + taxa fixa por item vendido; o percentual muda conforme participação em programas de frete grátis.', 'Cupons e moedas que você banca entram como "Desconto" na venda.', 'Shopee Ads: lance em Despesas para ver o lucro real.'],
      mercadolivre: ['Anúncio Clássico costuma ter comissão menor que o Premium.', 'Produtos abaixo de R$ 79 pagam um custo fixo por unidade (configurado acima).', 'Acima de R$ 79 o frete grátis costuma ser pago por você: preencha o campo Frete.'],
      magalu: ['Comissão por categoria mais taxa fixa por item vendido.', 'Frete do Magalu Entregas pode ser subsidiado: ajuste o frete por produto.', 'Anúncios patrocinados: registre em Despesas.'],
    };
    return '<ul style="margin:0;padding-left:18px;color:var(--text-2)">' + tips[id].map(t => `<li style="margin-bottom:6px">${t}</li>`).join('') + '</ul>';
  }

  // ---------------------------------------------------------------- Modais
  function openModal(html, size) {
    const root = $('#modalRoot');
    root.innerHTML = `<div class="modal-bg" data-act="modal-bg"><div class="modal ${size || ''}" role="dialog" aria-modal="true">${html}</div></div>`;
    const first = root.querySelector('input, select, textarea'); if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modalRoot').innerHTML = ''; }
  function confirmBox(msg, onYes, yesLabel) {
    openModal(`<div class="modal-head"><h2>Confirmar</h2><button class="icon-btn" data-act="close">✕</button></div><div class="modal-body"><p style="margin:0">${msg}</p></div>
      <div class="modal-foot"><button class="btn" data-act="close">Cancelar</button><button class="btn primary" id="yesBtn">${yesLabel || 'Confirmar'}</button></div>`, 'sm');
    $('#yesBtn').onclick = () => { closeModal(); onYes(); };
  }
  const numField = (name, label, value, hint, extra) => `<label class="field ${extra || ''}">${label}<input type="text" inputmode="decimal" name="${name}" value="${fmtInput(value)}" autocomplete="off">${hint ? `<span class="hint">${hint}</span>` : ''}</label>`;
  const txtField = (name, label, value, extra, attrs) => `<label class="field ${extra || ''}">${label}<input type="text" name="${name}" value="${esc(value || '')}" ${attrs || ''}></label>`;

  function feeFor(pid, price) {
    const s = db.settings.platforms[pid];
    return (s.fixedFeeBelow && price >= s.fixedFeeBelow) ? 0 : s.fixedFee;
  }

  // -------- Produto
  function productForm(prod, pid, copyMode) {
    const isNew = !prod || copyMode;
    const s = db.settings.platforms[pid];
    const p = prod ? Object.assign({}, prod) : { name: '', sku: '', category: '', supplier: '', status: 'ativo', cost: '', price: '', tax: s.tax, commission: s.commission, fixedFee: s.fixedFee, shipping: s.shipping, packaging: 0, otherCosts: 0, stock: 0, minStock: 0, weight: '', link: '', notes: '', targetMargin: 20 };
    if (copyMode) { p.platform = pid; const ss = db.settings.platforms[pid]; p.commission = ss.commission; p.tax = ss.tax; p.fixedFee = feeFor(pid, +p.price || 0); }
    const title = copyMode ? 'Copiar produto' : prod ? 'Editar produto' : 'Novo produto';
    openModal(`<form id="prodForm" autocomplete="off"><div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-act="close">✕</button></div>
      <div class="modal-body"><div class="form-layout"><div>
        <div class="form-section">Identificação</div>
        <div class="fgrid">
          ${txtField('name', 'Nome do produto *', p.name, 'span2', 'required')}
          ${txtField('sku', 'SKU / código', p.sku)}
          <label class="field">Plataforma<select name="platform">${PLATFORMS.map(x => `<option value="${x.id}" ${x.id === (p.platform || pid) ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
          ${txtField('category', 'Categoria', p.category)}
          ${txtField('supplier', 'Fornecedor', p.supplier)}
          <label class="field">Status<select name="status"><option value="ativo" ${p.status !== 'pausado' ? 'selected' : ''}>Ativo</option><option value="pausado" ${p.status === 'pausado' ? 'selected' : ''}>Pausado</option></select></label>
          ${txtField('link', 'Link do anúncio', p.link)}
        </div>
        <div class="form-section">Preço e custos por unidade</div>
        <div class="fgrid">
          ${numField('cost', 'Preço de custo (R$) *', p.cost, 'Quanto você paga no produto')}
          ${numField('price', 'Preço de venda (R$) *', p.price, 'Preço do anúncio')}
          ${numField('tax', 'Imposto (%)', p.tax, 'Sobre o preço de venda')}
          ${numField('commission', 'Comissão (%)', p.commission, 'Da plataforma')}
          ${numField('fixedFee', 'Taxa fixa (R$/un.)', p.fixedFee, s.fixedFeeBelow ? `Padrão: só abaixo de ${money(s.fixedFeeBelow)}` : '')}
          ${numField('shipping', 'Frete (R$/un.)', p.shipping, 'Pago por você')}
          ${numField('packaging', 'Embalagem (R$)', p.packaging, 'Caixa, etiqueta, fita…')}
          ${numField('otherCosts', 'Outros custos (R$)', p.otherCosts, 'ADS por unidade, brinde…')}
        </div>
        <div class="row mt"><button type="button" class="btn sm" data-act="pf-defaults">Usar taxas padrão da plataforma</button></div>
        <div class="form-section">Estoque</div>
        <div class="fgrid">
          ${numField('stock', 'Estoque (un.)', p.stock)}
          ${numField('minStock', 'Estoque mínimo', p.minStock, 'Avisa quando chegar')}
          ${numField('weight', 'Peso (g)', p.weight)}
          ${numField('targetMargin', 'Margem desejada (%)', p.targetMargin != null ? p.targetMargin : 20, 'Para sugerir preço')}
          <label class="field span4">Observações<textarea name="notes" rows="2">${esc(p.notes || '')}</textarea></label>
        </div>
        ${isNew ? `<div class="form-section">Também anunciar em</div><div class="row">${PLATFORMS.map(x => `<label class="row small" style="gap:6px"><input type="checkbox" name="alsoOn" value="${x.id}" data-also="${x.id}"> ${x.name}</label>`).join('')}</div><div class="hint small muted" style="margin-top:4px">Cria uma cópia em cada plataforma marcada, com as taxas padrão dela.</div>` : ''}
      </div>
      <aside class="preview" id="pfPreview"></aside></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn primary">${isNew ? 'Cadastrar produto' : 'Salvar alterações'}</button></div></form>`);
    const form = $('#prodForm');
    let feeTouched = !!prod && !copyMode;
    const read = () => {
      const f = new FormData(form); const o = {};
      ['name', 'sku', 'category', 'supplier', 'status', 'link', 'notes', 'platform'].forEach(k => { o[k] = (f.get(k) || '').toString().trim(); });
      ['cost', 'price', 'tax', 'commission', 'fixedFee', 'shipping', 'packaging', 'otherCosts', 'stock', 'minStock', 'weight', 'targetMargin'].forEach(k => { o[k] = parseNum(f.get(k)); });
      o.alsoOn = f.getAll('alsoOn');
      return o;
    };
    const syncAlso = () => { const plat = form.platform.value; $$('[data-also]', form).forEach(cb => { const own = cb.value === plat; cb.disabled = own; if (own) cb.checked = false; cb.parentElement.style.opacity = own ? .4 : 1; }); };
    const upd = () => { $('#pfPreview').innerHTML = productPreview(read()); };
    form.addEventListener('input', e => {
      if (e.target.name === 'fixedFee') feeTouched = true;
      if (e.target.name === 'price' && !feeTouched) form.fixedFee.value = fmtInput(feeFor(form.platform.value, parseNum(form.price.value)));
      upd();
    });
    form.platform.addEventListener('change', () => { applyDefaults(); syncAlso(); });
    function applyDefaults() {
      const ss = db.settings.platforms[form.platform.value];
      form.commission.value = fmtInput(ss.commission); form.tax.value = fmtInput(ss.tax);
      form.fixedFee.value = fmtInput(feeFor(form.platform.value, parseNum(form.price.value))); feeTouched = false;
      if (!parseNum(form.shipping.value)) form.shipping.value = fmtInput(ss.shipping);
      upd();
    }
    form.addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      if (b.dataset.act === 'pf-defaults') applyDefaults();
      if (b.dataset.act === 'pf-useprice') { form.price.value = fmtInput(+(+b.dataset.v).toFixed(2)); if (!feeTouched) form.fixedFee.value = fmtInput(feeFor(form.platform.value, +b.dataset.v)); upd(); }
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const o = read();
      if (!o.name) { toast('Informe o nome do produto'); return; }
      const also = o.alsoOn; delete o.alsoOn;
      if (prod && !copyMode) { Object.assign(prod, o, { updatedAt: new Date().toISOString() }); toast('Produto atualizado'); }
      else {
        db.products.push(Object.assign({ id: uid(), createdAt: new Date().toISOString() }, o));
        also.forEach(pidx => {
          const ss = db.settings.platforms[pidx];
          db.products.push(Object.assign({}, o, { id: uid(), platform: pidx, commission: ss.commission, tax: ss.tax, fixedFee: feeFor(pidx, o.price), createdAt: new Date().toISOString() }));
        });
        toast(also.length ? `Produto cadastrado em ${also.length + 1} plataformas` : 'Produto cadastrado');
      }
      save(); closeModal(); rerender();
    });
    if (isNew) syncAlso();
    upd();
  }
  function productPreview(o) {
    const c = prodCalc(o);
    const tm = (o.targetMargin || 0) / 100;
    const sug = c.priceFor(tm);
    const row = (l, v, k) => `<div class="pv-row ${k || ''}"><span class="lbl">${l}</span><span class="num">${v}</span></div>`;
    const parts = c.price > 0 ? [[c.cost, '#8a8984'], [c.taxV + c.commV + c.fixed, '#b6b5af'], [c.ship + c.pack + c.other, '#d6d5d0'], [Math.max(0, c.profit), '#0a7d0a']] : [];
    const tot = parts.reduce((s, x) => s + x[0], 0) || 1;
    return `<h4>Resultado por unidade</h4>
      ${row('Preço de venda', money(c.price))}
      ${row('− Custo do produto', money(c.cost))}
      ${row('− Imposto (' + n2(o.tax) + '%)', money(c.taxV))}
      ${row('− Comissão (' + n2(o.commission) + '%)', money(c.commV))}
      ${row('− Taxa fixa', money(c.fixed))}
      ${row('− Frete', money(c.ship))}
      ${row('− Embalagem + outros', money(c.pack + c.other))}
      ${row('Custo total', money(c.totalCost), 'sep')}
      <div class="pv-row total"><span>Você tira</span><span class="num ${cls(c.profit)}">${money(c.profit)}</span></div>
      ${parts.length ? `<div class="bar100" title="Custo produto · Impostos e taxas · Frete/emb. · Lucro">${parts.map(x => `<span style="width:${x[0] / tot * 100}%;background:${x[1]}"></span>`).join('')}</div><div class="small muted" style="margin-top:4px">produto · impostos/taxas · frete/emb. · <span class="pos">lucro</span></div>` : ''}
      <div class="pv-big">
        <div><div class="t">Margem</div><div class="v ${cls(c.margin)}">${pct(c.margin)}</div></div>
        <div><div class="t">Markup</div><div class="v">${pct(c.markup, 0)}</div></div>
        <div><div class="t">ROI</div><div class="v ${cls(c.roi)}">${pct(c.roi, 0)}</div></div>
        <div><div class="t">Preço mínimo</div><div class="v">${isFinite(c.breakEven) ? money(c.breakEven) : '—'}</div></div>
      </div>
      <div style="margin-top:12px;background:var(--surface);border-radius:8px;padding:10px">
        <div class="small"><b>Preço sugerido</b> p/ margem de ${n2(o.targetMargin || 0)}%</div>
        <div class="row" style="justify-content:space-between;margin-top:4px"><b class="num" style="font-size:17px">${isFinite(sug) && sug > 0 ? money(sug) : 'impossível'}</b>${isFinite(sug) && sug > 0 ? `<button type="button" class="btn sm" data-act="pf-useprice" data-v="${sug}">Usar</button>` : ''}</div>
      </div>
      ${(+o.stock || 0) > 0 ? `<div class="small muted" style="margin-top:10px">Estoque de ${n2(o.stock)} un. = ${money(c.stockValue)} em custo · lucro potencial ${money(c.stockProfit)}</div>` : ''}`;
  }

  // -------- Venda
  function saleForm(sale, pid, prodId, dup) {
    const prods = productsOf(pid);
    if (!prods.length && !sale) {
      openModal(`<div class="modal-head"><h2>Registrar venda</h2><button class="icon-btn" data-act="close">✕</button></div><div class="modal-body"><div class="empty"><p>Cadastre pelo menos um produto na ${PMAP[pid].name} antes de registrar vendas.</p><button class="btn plat" data-act="new-product" data-pid="${pid}">+ Cadastrar produto</button></div></div>`, 'sm');
      return;
    }
    const editing = sale && !dup;
    const base = sale ? Object.assign({}, sale) : null;
    if (dup && base) { base.date = todayStr(); base.orderId = ''; }
    const initialProd = productById(base ? base.productId : prodId) || prods[0];
    const s = base || snapshotFromProduct(initialProd, { date: todayStr(), qty: 1, discount: 0, status: 'entregue', orderId: '', notes: '' });
    openModal(`<form id="saleForm" autocomplete="off"><div class="modal-head"><h2>${editing ? 'Editar venda' : 'Registrar venda'} · ${PMAP[pid].name}</h2><button type="button" class="icon-btn" data-act="close">✕</button></div>
      <div class="modal-body"><div class="form-layout"><div>
        <div class="fgrid">
          <label class="field span2">Produto *<select name="productId">${prods.map(x => `<option value="${x.id}" ${x.id === s.productId ? 'selected' : ''}>${esc(x.name)}${x.sku ? ' · ' + esc(x.sku) : ''} (estoque ${n2(x.stock || 0)})</option>`).join('')}${s.productId && !productById(s.productId) ? `<option value="${esc(s.productId)}" selected>${esc(s.productName)} (excluído)</option>` : ''}</select></label>
          <label class="field">Data<input type="date" name="date" value="${s.date}" required></label>
          <label class="field">Status<select name="status">${Object.entries(SALE_STATUS).map(([k, v]) => `<option value="${k}" ${s.status === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></label>
          ${numField('qty', 'Quantidade', s.qty)}
          ${numField('unitPrice', 'Preço unitário (R$)', s.unitPrice)}
          ${numField('discount', 'Desconto / cupom (R$)', s.discount, 'Total do pedido')}
          ${numField('shipping', 'Frete pago (R$)', s.shipping, 'Total do pedido')}
          ${txtField('orderId', 'Nº do pedido', s.orderId)}
          ${txtField('notes', 'Observação', s.notes, 'span3', '')}
        </div>
        <details class="help mt" id="feeDetails"><summary>Custos e taxas desta venda (puxados do produto)</summary><div class="fgrid mt">
          ${numField('unitCost', 'Custo un. (R$)', s.unitCost)}
          ${numField('packaging', 'Embalagem un. (R$)', s.packaging)}
          ${numField('otherCosts', 'Outros un. (R$)', s.otherCosts)}
          ${numField('tax', 'Imposto (%)', s.tax)}
          ${numField('commission', 'Comissão (%)', s.commission)}
          ${numField('fixedFee', 'Taxa fixa un. (R$)', s.fixedFee)}
        </div></details>
      </div><aside class="preview" id="sfPreview"></aside></div></div>
      <div class="modal-foot"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn plat">${editing ? 'Salvar' : 'Registrar venda'}</button></div></form>`);
    const form = $('#saleForm');
    const read = () => {
      const f = new FormData(form); const o = {};
      ['productId', 'date', 'status', 'orderId', 'notes'].forEach(k => { o[k] = (f.get(k) || '').toString().trim(); });
      ['qty', 'unitPrice', 'discount', 'shipping', 'unitCost', 'packaging', 'otherCosts', 'tax', 'commission', 'fixedFee'].forEach(k => { o[k] = parseNum(f.get(k)); });
      return o;
    };
    const upd = () => { $('#sfPreview').innerHTML = salePreview(read()); };
    let shipTouched = !!editing;
    form.addEventListener('input', e => {
      if (e.target.name === 'shipping') shipTouched = true;
      if (e.target.name === 'qty' && !shipTouched) { const pr = productById(form.productId.value); if (pr) form.shipping.value = fmtInput((+pr.shipping || 0) * parseNum(form.qty.value)); }
      upd();
    });
    form.productId.addEventListener('change', () => {
      const pr = productById(form.productId.value); if (!pr) return;
      const snap = snapshotFromProduct(pr, { qty: parseNum(form.qty.value) || 1 });
      ['unitPrice', 'unitCost', 'packaging', 'otherCosts', 'tax', 'commission', 'fixedFee', 'shipping'].forEach(k => { form[k].value = fmtInput(snap[k]); });
      shipTouched = false; upd();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const o = read();
      if (o.qty <= 0) { toast('Quantidade inválida'); return; }
      const pr = productById(o.productId);
      o.productName = pr ? pr.name : (s.productName || 'Produto');
      o.platform = pid;
      if (editing) { applyStock(sale, -1); Object.assign(sale, o, { updatedAt: new Date().toISOString() }); applyStock(sale, 1); toast('Venda atualizada'); }
      else { const ns = Object.assign({ id: uid(), createdAt: new Date().toISOString() }, o); db.sales.push(ns); applyStock(ns, 1); toast('Venda registrada'); }
      save(); closeModal(); rerender();
    });
    upd();
  }
  function snapshotFromProduct(pr, extra) {
    const qty = (extra && extra.qty) || 1;
    return Object.assign({
      productId: pr.id, productName: pr.name, unitPrice: +pr.price || 0, unitCost: +pr.cost || 0, packaging: +pr.packaging || 0, otherCosts: +pr.otherCosts || 0,
      tax: +pr.tax || 0, commission: +pr.commission || 0, fixedFee: +pr.fixedFee || 0, shipping: (+pr.shipping || 0) * qty,
    }, extra || {});
  }
  function applyStock(sale, dir) {
    const st = SALE_STATUS[sale.status]; if (!st || !st.stock) return;
    const pr = productById(sale.productId); if (!pr) return;
    pr.stock = (+pr.stock || 0) - dir * (+sale.qty || 0);
  }
  function salePreview(o) {
    const c = saleCalc(o);
    const row = (l, v, k) => `<div class="pv-row ${k || ''}"><span class="lbl">${l}</span><span class="num">${v}</span></div>`;
    if (!c.counts) return `<h4>Resultado da venda</h4><div class="small muted">Vendas ${o.status === 'cancelada' ? 'canceladas não entram nos resultados nem baixam estoque' : 'devolvidas não contam como faturamento; o frete informado entra como prejuízo'}.</div>${o.status === 'devolvida' ? row('Prejuízo (frete)', money(-c.ship), 'sep total') : ''}`;
    return `<h4>Resultado da venda</h4>
      ${row('Valor bruto', money(c.gross))}${row('− Desconto', money(c.discount))}${row('Receita', '<b>' + money(c.revenue) + '</b>', 'sep')}
      ${row('− Custo dos produtos', money(c.cogs))}${row('− Embalagem + outros', money(c.packOther))}${row('− Imposto', money(c.taxV))}${row('− Comissão', money(c.commV))}${row('− Taxa fixa', money(c.fixed))}${row('− Frete', money(c.ship))}
      <div class="pv-row sep total"><span>Lucro</span><span class="num ${cls(c.profit)}">${money(c.profit)}</span></div>
      <div class="pv-big"><div><div class="t">Margem</div><div class="v ${cls(c.margin)}">${pct(c.margin)}</div></div><div><div class="t">Lucro por un.</div><div class="v">${money(c.qty ? c.profit / c.qty : 0)}</div></div></div>`;
  }

  // -------- Despesa
  function expenseForm(exp, pid) {
    const e = exp ? Object.assign({}, exp) : { date: todayStr(), platform: pid || 'geral', category: EXPENSE_CATS[0], description: '', amount: '' };
    openModal(`<form id="expForm" autocomplete="off"><div class="modal-head"><h2>${exp ? 'Editar despesa' : 'Nova despesa'}</h2><button type="button" class="icon-btn" data-act="close">✕</button></div>
      <div class="modal-body"><div class="fgrid" style="grid-template-columns:1fr 1fr">
        <label class="field">Data<input type="date" name="date" value="${e.date}" required></label>
        <label class="field">Plataforma<select name="platform"><option value="geral" ${e.platform === 'geral' ? 'selected' : ''}>Geral (todas)</option>${PLATFORMS.map(x => `<option value="${x.id}" ${e.platform === x.id ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
        <label class="field">Categoria<select name="category">${EXPENSE_CATS.map(c => `<option ${e.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></label>
        ${numField('amount', 'Valor (R$) *', e.amount)}
        ${txtField('description', 'Descrição', e.description, 'span4')}
      </div>${exp ? '' : '<label class="row small mt" style="gap:6px"><input type="checkbox" name="repeat"> Repetir nos próximos 11 meses (despesa mensal fixa)</label>'}</div>
      <div class="modal-foot"><button type="button" class="btn" data-act="close">Cancelar</button><button type="submit" class="btn primary">Salvar</button></div></form>`, 'sm');
    $('#expForm').addEventListener('submit', ev => {
      ev.preventDefault(); const f = new FormData(ev.target);
      const o = { date: f.get('date'), platform: f.get('platform'), category: f.get('category'), description: (f.get('description') || '').trim(), amount: parseNum(f.get('amount')) };
      if (!o.amount) { toast('Informe o valor'); return; }
      if (exp) Object.assign(exp, o);
      else {
        db.expenses.push(Object.assign({ id: uid() }, o));
        if (f.get('repeat')) {
          const d0 = parseISO(o.date);
          for (let i = 1; i <= 11; i++) { const d = new Date(d0.getFullYear(), d0.getMonth() + i, Math.min(d0.getDate(), 28)); db.expenses.push(Object.assign({ id: uid() }, o, { date: isoDate(d) })); }
        }
      }
      save(); closeModal(); toast('Despesa salva'); rerender();
    });
  }

  // -------- Copiar produto
  function copyProductDialog(prod) {
    openModal(`<div class="modal-head"><h2>Duplicar / copiar produto</h2><button class="icon-btn" data-act="close">✕</button></div><div class="modal-body"><p style="margin-top:0">Para qual plataforma você quer copiar <b>${esc(prod.name)}</b>?</p>
      <div class="row">${PLATFORMS.map(p => `<button class="btn" data-act="copy-to" data-id="${prod.id}" data-pid="${p.id}"><span class="pill"><span class="pdot" style="background:${p.color}"></span>${p.name}${p.id === prod.platform ? ' (duplicar)' : ''}</span></button>`).join('')}</div>
      <p class="small muted">Os custos são copiados; comissão, taxa e imposto usam o padrão da plataforma escolhida. Você pode ajustar antes de salvar.</p></div>`, 'sm');
  }

  // ---------------------------------------------------------------- Calculadora
  const calcState = { mode: 'margem', cost: '', packaging: '', otherCosts: '', shipping: '', tax: '', margin: 20, price: '' };
  function renderCalc(view) {
    if (calcState.tax === '') calcState.tax = db.settings.platforms[PLATFORMS[0].id].tax;
    view.innerHTML = `<div class="topbar"><div class="page-title"><div><h1>Calculadora de preço</h1><div class="sub">Compare as 4 plataformas com os mesmos custos</div></div></div></div>
      <div class="card" style="margin-bottom:16px"><form id="calcForm" autocomplete="off">
        <div class="row" style="margin-bottom:12px"><div class="seg"><button type="button" data-act="calc-mode" data-k="margem" class="${calcState.mode === 'margem' ? 'on' : ''}">Quero uma margem → qual preço?</button><button type="button" data-act="calc-mode" data-k="preco" class="${calcState.mode === 'preco' ? 'on' : ''}">Tenho um preço → quanto lucro?</button></div></div>
        <div class="fgrid" style="grid-template-columns:repeat(6,1fr)">
          ${numField('cost', 'Custo do produto (R$)', calcState.cost)}
          ${numField('packaging', 'Embalagem (R$)', calcState.packaging)}
          ${numField('otherCosts', 'Outros (R$)', calcState.otherCosts)}
          ${numField('shipping', 'Frete (R$)', calcState.shipping)}
          ${numField('tax', 'Imposto (%)', calcState.tax)}
          ${calcState.mode === 'margem' ? numField('margin', 'Margem desejada (%)', calcState.margin) : numField('price', 'Preço de venda (R$)', calcState.price)}
        </div></form></div>
      <div class="calc-grid" id="calcOut"></div>
      <p class="small muted mt">Usa a comissão e a taxa fixa configuradas em cada plataforma (aba "Taxas e configurações").</p>`;
    const form = $('#calcForm');
    form.addEventListener('input', () => { const f = new FormData(form); ['cost', 'packaging', 'otherCosts', 'shipping', 'tax', 'margin', 'price'].forEach(k => { if (f.has(k)) calcState[k] = f.get(k); }); calcOut(); });
    calcOut();
  }
  function calcOut() {
    const g = k => parseNum(calcState[k]);
    let h = '';
    const results = PLATFORMS.map(p => {
      const s = db.settings.platforms[p.id];
      const base = { cost: g('cost'), packaging: g('packaging'), otherCosts: g('otherCosts'), shipping: g('shipping'), tax: g('tax'), commission: s.commission, fixedFee: s.fixedFee };
      let price;
      if (calcState.mode === 'margem') {
        price = prodCalc(base).priceFor(g('margin') / 100);
        if (s.fixedFeeBelow && isFinite(price)) {
          // Se o preço ficar acima do limite, recalcula sem a taxa fixa
          const noFee = prodCalc(Object.assign({}, base, { fixedFee: 0 })).priceFor(g('margin') / 100);
          if (noFee >= s.fixedFeeBelow) { price = noFee; base.fixedFee = 0; }
        }
      } else { price = g('price'); base.fixedFee = feeFor(p.id, price); }
      const c = prodCalc(Object.assign(base, { price: isFinite(price) ? price : 0 }));
      return { p, c, price, ok: isFinite(price) && price > 0 };
    });
    const best = results.filter(x => x.ok).sort((a, b) => calcState.mode === 'margem' ? a.price - b.price : b.c.profit - a.c.profit)[0];
    results.forEach(({ p, c, price, ok }) => {
      const row = (l, v, k) => `<div class="pv-row ${k || ''}"><span class="lbl">${l}</span><span class="num">${v}</span></div>`;
      h += `<div class="card calc-card" style="--pc:${p.color}"><div class="row" style="justify-content:space-between"><h3>${p.name}</h3>${best && best.p.id === p.id && g('cost') ? `<span class="pill good">${calcState.mode === 'margem' ? 'Menor preço' : 'Maior lucro'}</span>` : ''}</div>
        <div class="card-sub">${n2(db.settings.platforms[p.id].commission)}% + ${money(c.fixed)} fixo</div>
        <div class="small muted">${calcState.mode === 'margem' ? 'Venda por' : 'Você tira'}</div>
        <div class="price num ${calcState.mode === 'preco' ? cls(c.profit) : ''}">${ok ? money(calcState.mode === 'margem' ? price : c.profit) : '—'}</div>
        <div class="mt">${row('Preço', money(c.price))}${row('Imposto', money(c.taxV))}${row('Comissão', money(c.commV))}${row('Taxa fixa', money(c.fixed))}${row('Frete + emb. + outros', money(c.ship + c.pack + c.other))}${row('Custo produto', money(c.cost))}
        <div class="pv-row sep total"><span>Lucro</span><span class="num ${cls(c.profit)}">${money(c.profit)}</span></div>${row('Margem', pct(c.margin))}${row('Preço mínimo (lucro zero)', isFinite(c.breakEven) ? money(c.breakEven) : '—')}</div></div>`;
    });
    $('#calcOut').innerHTML = h;
  }

  // ---------------------------------------------------------------- Configurações
  function renderConfig(view) {
    const st = db.settings;
    view.innerHTML = `<div class="topbar"><div class="page-title"><div><h1>Configurações</h1><div class="sub">Loja, segurança e backup</div></div></div></div>
      <div class="grid g2">
        <div class="card"><h3>Sua loja</h3><div class="card-sub">Nome exibido no menu</div><form id="storeForm" class="row"><input type="text" name="storeName" value="${esc(st.storeName)}" style="flex:1"><button class="btn primary">Salvar</button></form>
          <div class="form-section mt">Imposto para todas as plataformas</div><form id="taxForm" class="row"><input type="text" inputmode="decimal" name="tax" placeholder="Ex.: 6" style="flex:1"><button class="btn">Aplicar em todas</button></form><div class="small muted" style="margin-top:4px">Atualiza a alíquota padrão das 4 plataformas e de todos os produtos.</div></div>
        <div class="card"><h3>Senha de acesso</h3><div class="card-sub">${st.pinHash ? 'Senha ativada neste navegador.' : 'Peça uma senha ao abrir o sistema neste navegador.'}</div>
          <form id="pinForm" class="row"><input type="password" name="pin" placeholder="${st.pinHash ? 'Nova senha' : 'Crie uma senha'}" style="flex:1" autocomplete="new-password"><button class="btn primary">${st.pinHash ? 'Trocar' : 'Ativar'}</button>${st.pinHash ? '<button type="button" class="btn danger" data-act="pin-off">Remover</button>' : ''}</form></div>
      </div>
      <div class="grid g2">
        <div class="card"><h3>Backup</h3><div class="card-sub">Seus dados ficam salvos neste navegador. Faça backup com frequência e use o arquivo para abrir em outro computador ou celular.</div>
          <div class="row"><button class="btn primary" data-act="export-json">Baixar backup (.json)</button><label class="btn">Restaurar backup<input type="file" accept=".json,application/json" id="importFile" hidden></label></div>
          <div class="form-section mt">Planilhas</div><div class="row"><button class="btn" data-act="export-products">Produtos (.csv)</button><button class="btn" data-act="export-sales" data-pid="">Vendas (.csv)</button><button class="btn" data-act="export-expenses">Despesas (.csv)</button></div>
          <div class="small muted mt">${db.products.length} produtos · ${db.sales.length} vendas · ${db.expenses.length} despesas${storageOk ? '' : ' · <span class="neg">erro ao salvar</span>'}</div></div>
        <div class="card"><h3>Dados de exemplo e limpeza</h3><div class="card-sub">Use os exemplos para conhecer o sistema; depois limpe e cadastre os seus.</div>
          <div class="row"><button class="btn" data-act="sample">Carregar dados de exemplo</button><button class="btn danger" data-act="wipe">Apagar todos os dados</button></div></div>
      </div>`;
    $('#storeForm').addEventListener('submit', e => { e.preventDefault(); st.storeName = new FormData(e.target).get('storeName').trim() || 'Minha Loja'; save(); toast('Salvo'); rerender(); });
    $('#taxForm').addEventListener('submit', e => {
      e.preventDefault(); const v = new FormData(e.target).get('tax'); if (String(v).trim() === '') return; const t = parseNum(v);
      confirmBox(`Aplicar imposto de <b>${n2(t)}%</b> em todas as plataformas e em todos os ${db.products.length} produtos? Vendas já registradas não mudam.`, () => {
        PLATFORMS.forEach(p => { st.platforms[p.id].tax = t; }); db.products.forEach(p => { p.tax = t; }); save(); toast('Imposto aplicado'); rerender();
      });
    });
    $('#pinForm').addEventListener('submit', async e => {
      e.preventDefault(); const pin = new FormData(e.target).get('pin');
      if (!pin || pin.length < 4) { toast('Use pelo menos 4 caracteres'); return; }
      st.pinHash = await hash(pin); save(); toast('Senha ativada'); rerender();
    });
    $('#importFile').addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const data = JSON.parse(rd.result);
          if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) throw new Error('formato');
          confirmBox(`Restaurar backup com <b>${data.products.length}</b> produtos e <b>${data.sales.length}</b> vendas? Os dados atuais serão substituídos.`, () => { db = normalizeDB(data); save(); toast('Backup restaurado'); rerender(); }, 'Restaurar');
        } catch (err) { toast('Arquivo de backup inválido'); }
      };
      rd.readAsText(file);
    });
  }

  // ---------------------------------------------------------------- Exportação
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const csvNum = v => (isFinite(v) ? (+v).toFixed(2) : '0').replace('.', ',');
  const csvCell = v => { const s = String(v == null ? '' : v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  function toCSV(header, rows) { return '﻿' + [header].concat(rows).map(r => r.map(csvCell).join(';')).join('\r\n'); }
  function exportProducts() {
    const rows = db.products.map(p => { const c = prodCalc(p); return [PMAP[p.platform].name, p.name, p.sku, p.category, p.supplier, p.status, p.stock, p.minStock, csvNum(c.cost), csvNum(c.price), csvNum(p.tax), csvNum(c.taxV), csvNum(p.commission), csvNum(c.commV), csvNum(c.fixed), csvNum(c.ship), csvNum(c.pack), csvNum(c.other), csvNum(c.totalCost), csvNum(c.profit), csvNum(c.margin * 100), csvNum(c.markup * 100), csvNum(c.roi * 100), csvNum(c.breakEven), p.link, p.notes]; });
    download('produtos.csv', toCSV(['Plataforma', 'Produto', 'SKU', 'Categoria', 'Fornecedor', 'Status', 'Estoque', 'Estoque mínimo', 'Custo', 'Preço venda', 'Imposto %', 'Imposto R$', 'Comissão %', 'Comissão R$', 'Taxa fixa', 'Frete', 'Embalagem', 'Outros', 'Custo total', 'Lucro un.', 'Margem %', 'Markup %', 'ROI %', 'Preço mínimo', 'Link', 'Obs'], rows), 'text/csv;charset=utf-8');
  }
  function exportSales(pid) {
    const list = db.sales.filter(s => !pid || s.platform === pid).sort((a, b) => a.date.localeCompare(b.date));
    const rows = list.map(s => { const c = saleCalc(s); return [fmtDate(s.date), PMAP[s.platform].name, s.orderId, s.productName, (SALE_STATUS[s.status] || {}).label, s.qty, csvNum(s.unitPrice), csvNum(s.discount), csvNum(c.revenue), csvNum(c.cogs), csvNum(c.packOther), csvNum(c.taxV), csvNum(c.commV), csvNum(c.fixed), csvNum(c.ship), csvNum(c.profit), csvNum(c.margin * 100), s.notes]; });
    download('vendas' + (pid ? '-' + pid : '') + '.csv', toCSV(['Data', 'Plataforma', 'Pedido', 'Produto', 'Status', 'Qtd', 'Preço un.', 'Desconto', 'Receita', 'Custo produtos', 'Embalagem+outros', 'Imposto', 'Comissão', 'Taxa fixa', 'Frete', 'Lucro', 'Margem %', 'Obs'], rows), 'text/csv;charset=utf-8');
  }
  function exportExpenses() {
    const rows = db.expenses.slice().sort((a, b) => a.date.localeCompare(b.date)).map(e => [fmtDate(e.date), e.platform === 'geral' ? 'Geral' : PMAP[e.platform].name, e.category, e.description, csvNum(e.amount)]);
    download('despesas.csv', toCSV(['Data', 'Plataforma', 'Categoria', 'Descrição', 'Valor'], rows), 'text/csv;charset=utf-8');
  }

  // ---------------------------------------------------------------- Dados de exemplo
  function loadSample() {
    const fresh = freshDB(); fresh.settings.storeName = db.settings.storeName; fresh.settings.pinHash = db.settings.pinHash;
    const catalog = [
      ['Fone Bluetooth TWS Pro', 'Eletrônicos', 38, 119.9], ['Garrafa Térmica Inox 1L', 'Casa', 24, 79.9], ['Kit 3 Organizadores de Gaveta', 'Casa', 12.5, 49.9],
      ['Luminária LED de Mesa', 'Casa', 31, 89.9], ['Capa de Celular Antichoque', 'Acessórios', 3.8, 29.9], ['Smartwatch Fit 2', 'Eletrônicos', 72, 199.9],
      ['Mochila Notebook Impermeável', 'Bolsas', 45, 139.9], ['Suporte Articulado p/ Celular', 'Acessórios', 9.9, 39.9],
    ];
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    PLATFORMS.forEach((p, pi) => {
      const s = fresh.settings.platforms[p.id];
      catalog.forEach(([name, cat, cost, price], i) => {
        if ((i + pi) % 5 === 4) return;
        const pr = +(price * (0.95 + pi * 0.04)).toFixed(2) - 0.01 + 0.01;
        fresh.products.push({ id: uid(), platform: p.id, name, sku: 'SKU-' + (100 + i), category: cat, supplier: i % 2 ? 'Fornecedor SP' : 'Importadora Sul', status: 'ativo', cost, price: +pr.toFixed(2), tax: s.tax, commission: s.commission, fixedFee: s.fixedFeeBelow && pr >= s.fixedFeeBelow ? 0 : s.fixedFee, shipping: pr >= 79 && p.id === 'mercadolivre' ? 18.9 : 0, packaging: 1.8, otherCosts: i === 5 ? 4 : 0.5, stock: Math.round(5 + rnd() * 60), minStock: 8, weight: 300, link: '', notes: '', targetMargin: 20, createdAt: new Date().toISOString() });
      });
    });
    const t = todayStr();
    const weights = { amazon: 0.8, shopee: 1.5, mercadolivre: 1.3, magalu: 0.6 };
    for (let d = 120; d >= 0; d--) {
      const date = addDays(t, -d);
      PLATFORMS.forEach(p => {
        const prods = fresh.products.filter(x => x.platform === p.id);
        const n = Math.floor(rnd() * 3.2 * weights[p.id]);
        for (let k = 0; k < n; k++) {
          const pr = prods[Math.floor(rnd() * prods.length)];
          const qty = rnd() < 0.85 ? 1 : 2;
          const r = rnd();
          const status = r < 0.04 ? 'cancelada' : r < 0.07 ? 'devolvida' : d < 3 ? 'pendente' : d < 7 ? 'enviada' : 'entregue';
          fresh.sales.push(Object.assign(snapshotFromProduct(pr, { qty }), { id: uid(), platform: p.id, date, qty, status, discount: rnd() < 0.15 ? 5 : 0, orderId: p.short + '-' + Math.floor(100000 + rnd() * 899999), notes: '', createdAt: new Date().toISOString() }));
        }
      });
    }
    for (let m = 0; m < 4; m++) {
      const dt = new Date(); dt.setDate(5); dt.setMonth(dt.getMonth() - m); const ds = isoDate(dt);
      if (ds > t) continue;
      fresh.expenses.push({ id: uid(), date: ds, platform: 'amazon', category: 'Mensalidade / plano', description: 'Plano profissional', amount: 19 });
      fresh.expenses.push({ id: uid(), date: ds, platform: 'shopee', category: 'Anúncios / ADS', description: 'Shopee Ads', amount: 150 + Math.round(rnd() * 100) });
      fresh.expenses.push({ id: uid(), date: ds, platform: 'mercadolivre', category: 'Anúncios / ADS', description: 'Product Ads', amount: 200 + Math.round(rnd() * 120) });
      fresh.expenses.push({ id: uid(), date: ds, platform: 'geral', category: 'Contador', description: 'Honorários', amount: 250 });
    }
    db = fresh; save(); toast('Dados de exemplo carregados'); rerender();
  }

  // ---------------------------------------------------------------- Senha
  async function hash(txt) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('cv-salt:' + txt));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    let h = 0; for (const ch of 'cv-salt:' + txt) h = (h * 31 + ch.charCodeAt(0)) | 0; return 'x' + h;
  }
  function showLock(onOk) {
    const el = document.createElement('div'); el.className = 'lock';
    el.innerHTML = `<form class="lock-box" id="lockForm"><div class="brand-logo" style="margin:0 auto">CV</div><h2>${esc(db.settings.storeName)}</h2><p>Digite sua senha para entrar</p><input type="password" name="pin" autocomplete="current-password" autofocus><div class="err" id="lockErr"></div><button class="btn primary" style="width:100%;justify-content:center">Entrar</button></form>`;
    document.body.appendChild(el);
    $('#lockForm').addEventListener('submit', async e => {
      e.preventDefault(); const pin = new FormData(e.target).get('pin');
      if (await hash(pin) === db.settings.pinHash) { el.remove(); try { sessionStorage.setItem('cv_unlocked', '1'); } catch (x) { /* ok */ } onOk(); }
      else { $('#lockErr').textContent = 'Senha incorreta'; }
    });
  }

  // ---------------------------------------------------------------- Eventos
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'modal-bg') { if (e.target === b) closeModal(); return; }
    switch (act) {
      case 'close': closeModal(); break;
      case 'period': period.key = b.dataset.k; if (period.key === 'custom' && !period.from) { const r = getRange(); period.from = r.from; period.to = r.to; } savePeriod(); rerender(); break;
      case 'new-product': closeModal(); productForm(null, b.dataset.pid); break;
      case 'edit-product': { const p = productById(b.dataset.id); if (p) productForm(p, p.platform); break; }
      case 'copy-product': { const p = productById(b.dataset.id); if (p) copyProductDialog(p); break; }
      case 'copy-to': { const p = productById(b.dataset.id); if (p) { closeModal(); const c = Object.assign({}, p); delete c.id; c.name = p.platform === b.dataset.pid ? p.name + ' (cópia)' : p.name; productForm(c, b.dataset.pid, true); } break; }
      case 'del-product': { const p = productById(b.dataset.id); if (p) confirmBox(`Excluir <b>${esc(p.name)}</b>? As vendas já registradas continuam no histórico.`, () => { db.products = db.products.filter(x => x.id !== p.id); save(); toast('Produto excluído'); rerender(); }, 'Excluir'); break; }
      case 'new-sale': closeModal(); saleForm(null, b.dataset.pid, b.dataset.prod); break;
      case 'edit-sale': { const s = db.sales.find(x => x.id === b.dataset.id); if (s) saleForm(s, s.platform); break; }
      case 'dup-sale': { const s = db.sales.find(x => x.id === b.dataset.id); if (s) saleForm(s, s.platform, null, true); break; }
      case 'del-sale': { const s = db.sales.find(x => x.id === b.dataset.id); if (s) confirmBox(`Excluir esta venda de <b>${esc(s.productName)}</b> (${fmtDate(s.date)})? O estoque será devolvido.`, () => { applyStock(s, -1); db.sales = db.sales.filter(x => x.id !== s.id); save(); toast('Venda excluída'); rerender(); }, 'Excluir'); break; }
      case 'new-expense': expenseForm(null, b.dataset.pid); break;
      case 'edit-expense': { const x = db.expenses.find(y => y.id === b.dataset.id); if (x) expenseForm(x); break; }
      case 'del-expense': confirmBox('Excluir esta despesa?', () => { db.expenses = db.expenses.filter(x => x.id !== b.dataset.id); save(); rerender(); }, 'Excluir'); break;
      case 'sort': {
        const t = b.dataset.t, k = b.dataset.k; const s = ui.sort[t];
        ui.sort[t] = s && s.key === k ? { key: k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: k, dir: k === 'name' || k === 'product' || k === 'platform' ? 'asc' : 'desc' };
        if (t.startsWith('prod')) renderProductsTable(t === 'prod-all' ? null : t.slice(5)); else renderSalesTable(t.slice(5));
        break;
      }
      case 'apply-rates': { const pid = b.dataset.pid; const s = db.settings.platforms[pid]; const n = productsOf(pid).length;
        confirmBox(`Aplicar comissão ${n2(s.commission)}%, taxa fixa e imposto ${n2(s.tax)}% aos <b>${n}</b> produtos da ${PMAP[pid].name}? (salve as taxas antes)`, () => { productsOf(pid).forEach(p => { p.commission = s.commission; p.tax = s.tax; p.fixedFee = feeFor(pid, +p.price || 0); }); save(); toast('Taxas aplicadas'); rerender(); }); break; }
      case 'reset-rates': { const pid = b.dataset.pid; db.settings.platforms[pid] = Object.assign({}, PMAP[pid].defaults); save(); toast('Padrão restaurado'); rerender(); break; }
      case 'calc-mode': calcState.mode = b.dataset.k; rerender(); break;
      case 'export-json': download('backup-vendas-' + todayStr() + '.json', JSON.stringify(db, null, 1), 'application/json'); break;
      case 'export-products': exportProducts(); break;
      case 'export-sales': exportSales(b.dataset.pid); break;
      case 'export-expenses': exportExpenses(); break;
      case 'sample': if (db.products.length || db.sales.length) confirmBox('Isso vai <b>substituir</b> seus dados atuais por dados de exemplo. Baixe um backup antes se precisar. Continuar?', loadSample, 'Substituir'); else loadSample(); break;
      case 'wipe': confirmBox('Apagar <b>todos</b> os produtos, vendas e despesas deste navegador? Não dá para desfazer.', () => { const keep = db.settings; db = freshDB(); db.settings.storeName = keep.storeName; db.settings.pinHash = keep.pinHash; db.settings.platforms = keep.platforms; save(); toast('Dados apagados'); rerender(); }, 'Apagar tudo'); break;
      case 'pin-off': db.settings.pinHash = ''; save(); toast('Senha removida'); rerender(); break;
      default: break;
    }
  });
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'search') {
      ui.q[t.dataset.t] = t.value;
      if (t.dataset.t.startsWith('prod')) renderProductsTable(t.dataset.t === 'prod-all' ? null : t.dataset.t.slice(5)); else renderSalesTable(t.dataset.t.slice(5));
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.dataset && t.dataset.act === 'status-filter') { ui.status[t.dataset.t] = t.value; renderSalesTable(t.dataset.t.slice(5)); }
    if (t.id === 'pFrom' || t.id === 'pTo') {
      period.from = $('#pFrom').value; period.to = $('#pTo').value;
      if (period.from && period.to && period.from > period.to) { const x = period.from; period.from = period.to; period.to = x; }
      savePeriod(); rerender();
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#modalRoot').innerHTML) closeModal(); });
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- Início
  let unlocked = false;
  try { unlocked = sessionStorage.getItem('cv_unlocked') === '1'; } catch (e) { /* ok */ }
  if (db.settings.pinHash && !unlocked) showLock(route); else route();
})();
