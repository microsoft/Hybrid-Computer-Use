// Charts for the HCU project page: one small renderer per chart type, one tooltip,
// and one draw-in animation. All numbers on the results tabs come from RESULTS below.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Page language: zh.html loads a dictionary into window.HCU_I18N; English pages use the source strings.
  const I18N = window.HCU_I18N || {};
  const t = (s) => (Object.prototype.hasOwnProperty.call(I18N, s) ? I18N[s] : s);
  // Every visible string passes through esc(), so esc() also looks the string up.
  const esc = (s) => String(t(String(s))).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const pct = (v, max) => `${Math.max(0, Math.min(100, (v / max) * 100)).toFixed(2)}%`;

  /* ---------- Tooltip ---------- */
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.hidden = true;
  document.body.appendChild(tip);
  const tipHtml = (title, rows = []) =>
    `<strong>${esc(title)}</strong>${rows.map(([k, v]) => `<span><em>${esc(k)}</em>${esc(v)}</span>`).join('')}`;
  function placeTip(x, y) {
    const r = tip.getBoundingClientRect();
    const left = Math.min(window.innerWidth - r.width - 8, x + 14);
    const top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
    tip.style.transform = `translate(${Math.max(8, left)}px, ${Math.max(8, top)}px)`;
  }
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest('[data-tip]');
    if (!el) return;
    tip.innerHTML = el.dataset.tip;
    tip.hidden = false;
    placeTip(e.clientX, e.clientY);
  });
  document.addEventListener('pointermove', (e) => { if (!tip.hidden) placeTip(e.clientX, e.clientY); });
  document.addEventListener('pointerout', (e) => {
    const el = e.target.closest('[data-tip]');
    if (el && !el.contains(e.relatedTarget)) tip.hidden = true;
  });
  addEventListener('scroll', () => { if (!tip.hidden) tip.hidden = true; }, { passive: true });

  /* ---------- Draw-in: bars grow once when a chart first becomes visible ---------- */
  const drawObserver = 'IntersectionObserver' in window && !reduceMotion
    ? new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-drawn');
        drawObserver.unobserve(entry.target);
      }
    }, { threshold: 0.15 })
    : null;
  function observe(root) {
    for (const el of $$('.chart', root)) {
      if (drawObserver) drawObserver.observe(el);
      else el.classList.add('is-drawn');
    }
  }

  /* ---------- Formatting ---------- */
  function deltaText(base, ours, better, unit) {
    if (unit === 'pp') {
      const d = ours - base;
      return { text: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)} pp`, good: better === 'higher' ? d > 0 : d < 0 };
    }
    const d = ((ours - base) / base) * 100;
    return { text: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%`, good: better === 'higher' ? d > 0 : d < 0 };
  }
  const chip = (text, good = true) => `<em class="chip${good ? ' is-good' : ' is-bad'}">${esc(text)}</em>`;

  /* ---------- Horizontal score bars on a 0..max axis ---------- */
  function scoreBars({ rows, max = 100, step = 20, unit = '%' }) {
    const ticks = [];
    for (let v = 0; v <= max; v += step) ticks.push(v);
    return `<div class="chart cbars" style="--cols:${ticks.length - 1}">${rows.map((r) => `
      <div class="cbar${r.ours ? ' is-ours' : ''}${r.mid ? ' is-mid' : ''}" data-tip="${esc(tipHtml(r.label, r.tip || [['Score', `${r.value}${unit}`]]))}">
        <span class="cbar-label">${esc(r.label)}</span>
        <span class="cbar-track"><span class="cbar-fill" style="--w:${pct(r.value, max)}"></span></span>
        <span class="cbar-value">${esc(r.display || `${r.value}${unit}`)}${r.delta ? chip(r.delta) : ''}</span>
      </div>`).join('')}
      <div class="cbar-axis"><span></span><span class="cbar-ticks">${ticks.map((v) => `<i style="left:${pct(v, max)}">${v}</i>`).join('')}</span><span></span></div>
    </div>`;
  }

  /* ---------- Small multiples: one metric, two or three systems ---------- */
  function tiles(metrics, systems) {
    return `<div class="chart tiles">${metrics.map((m) => {
      const values = m.values;
      const max = Math.max(...values);
      const base = values[m.baseIndex ?? 0];
      const ours = values[values.length - 1];
      const d = deltaText(base, ours, m.better || 'lower', m.deltaUnit);
      return `<div class="tile">
        <div class="tile-head"><span>${esc(m.name)}</span>${chip(d.text, d.good)}</div>
        ${values.map((v, i) => {
          const isOurs = i === values.length - 1;
          const label = m.format ? m.format(v) : v;
          return `<div class="tile-row${isOurs ? ' is-ours' : ''}" data-tip="${esc(tipHtml(systems[i], [[m.name, String(label)]]))}">
            <span class="tile-name">${esc(systems[i])}</span>
            <span class="tile-track"><i style="--w:${pct(v, max)}"></i></span>
            <b>${esc(label)}</b></div>`;
        }).join('')}
      </div>`;
    }).join('')}</div>`;
  }

  /* ---------- Plain table for the "All numbers" drawer ---------- */
  function table(head, rows, oursCol) {
    return `<div class="table-wrap"><table class="table"><thead><tr>${head.map((h, i) =>
      `<th${i === oursCol ? ' class="is-ours"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) =>
      `<tr${r.ours ? ' class="is-ours"' : ''}>${r.cells.map((c, i) => {
        const cls = [i === oursCol ? 'is-ours' : '', /^[+−]/.test(c) && i === r.cells.length - 1 && r.delta !== false ? 'delta' : ''].filter(Boolean).join(' ');
        return `<td${cls ? ` class="${cls}"` : ''}>${esc(c)}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- Scatter: score against cost ---------- */
  function scatter(points, { x: [x0, x1], y: [y0, y1], xTicks, yTicks, xLabel, yLabel, arrows, frontier }) {
    const W = 640; const H = 380; const m = { l: 52, r: 20, t: 18, b: 52 };
    const sx = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
    const sy = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const grid = yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${m.l - 10}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('')
      + xTicks.map((v) => `<text class="ax" x="${sx(v)}" y="${H - m.b + 22}" text-anchor="middle">$${v}</text>`).join('');
    const byId = Object.fromEntries(points.map((p) => [p.id, p]));
    const front = frontier ? `<path class="frontier" d="M${frontier.map((id) => `${sx(byId[id].cost)} ${sy(byId[id].score)}`).join(' L')}"/>` : '';
    const arr = (arrows || []).map(([from, to]) => {
      const a = byId[from]; const b = byId[to];
      const ax = sx(a.cost); const ay = sy(a.score); const bx = sx(b.cost); const by = sy(b.score);
      const len = Math.hypot(bx - ax, by - ay);
      const k = (len - 12) / len; const s = 9 / len;
      return `<path class="arrow" d="M${ax + (bx - ax) * s} ${ay + (by - ay) * s} L${ax + (bx - ax) * k} ${ay + (by - ay) * k}"/>`;
    }).join('');
    const dots = points.map((p) => `
      <g class="pt${p.ours ? ' is-ours' : ''}" tabindex="0" data-tip="${esc(tipHtml(p.name, p.tip))}">
        <circle cx="${sx(p.cost)}" cy="${sy(p.score)}" r="${p.ours ? 8 : 6.5}"/>
        <text x="${sx(p.cost) + (p.dx ?? 12)}" y="${sy(p.score) + (p.dy ?? 4)}" text-anchor="${p.anchor || 'start'}">${esc(p.short || p.name)}</text>
      </g>`).join('');
    return `<svg class="chart scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} · ${esc(xLabel)}">
      <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 10 5 0 10z"/></marker></defs>
      <g class="grid">${grid}</g>
      <text class="ax-title" x="${(W + m.l - m.r) / 2}" y="${H - 8}" text-anchor="middle">${esc(xLabel)}</text>
      <text class="ax-title" x="14" y="${(H - m.b + m.t) / 2}" text-anchor="middle" transform="rotate(-90 14 ${(H - m.b + m.t) / 2})">${esc(yLabel)}</text>
      ${front}${arr}${dots}
    </svg>`;
  }

  /* ---------- Hero: OSWorld 2.0 score against cost, with the Pareto staircase ---------- */
  function heroChart(el) {
    // Narrow screens get a narrower canvas and short labels, so text stays readable.
    const narrow = el.clientWidth < 520;
    const W = narrow ? 400 : 620; const H = narrow ? 300 : 270; const m = { l: 50, r: 16, t: 14, b: 46 };
    const x0 = 0; const x1 = 35; const y0 = 60; const y1 = 76;
    const sx = (v) => m.l + ((v - x0) / (x1 - x0)) * (W - m.l - m.r);
    const sy = (v) => H - m.b - ((v - y0) / (y1 - y0)) * (H - m.t - m.b);
    const P = [
      { name: 'HCU · GPT-6 Astra', short: 'HCU · Astra', cost: 10.03, score: 72.37, ours: true, dx: -10, dy: -30, anchor: 'end', tip: [['Partial', '72.37%'], ['Binary', '32.40%'], ['Cost', '$10.03']] },
      { name: 'HCU · Claude Opus 5', short: 'HCU · Opus 5', cost: 22.67, score: 72.06, ours: true, dx: 0, dy: -30, anchor: 'middle', tip: [['Partial', '72.06%'], ['Binary', '35.19%'], ['Cost', '$22.67']] },
      { name: 'CUA Driver · GPT-6 Astra', short: 'CUA Driver', cost: 10.05, score: 68.82, dx: 12, dy: 4, tip: [['Partial', '68.82%'], ['Binary', '31.50%'], ['Cost', '$10.05']] },
      { name: 'GUI loop · Claude Opus 5', short: 'GUI loop · Opus 5', cost: 28.43, score: 68.31, dx: 0, dy: 26, anchor: 'end', tip: [['Partial', '68.31%'], ['Binary', '31.43%'], ['Cost', '$28.43']] },
      { name: 'GUI loop · GPT-5.6 Sol', short: 'GUI loop · Sol', cost: 13.94, score: 62.72, dx: 12, dy: 4, tip: [['Partial', '62.72%'], ['Binary', '27.34%'], ['Cost', '$13.94']] },
      { name: 'StateAct · Claude Opus 4.8', short: 'StateAct', cost: 7.8, score: 61.6, dx: -10, dy: -10, anchor: 'end', tip: [['Partial', '61.60%'], ['Binary', '26.90%'], ['Cost', '~$7.80']] },
    ];
    const pct = (v) => `${v.toFixed(2)}%`;
    // Staircase through the non-dominated points: StateAct, then HCU with GPT-6 Astra.
    const stair = [[7.8, 61.6], [10.03, 61.6], [10.03, 72.37], [x1, 72.37]].map(([x, y]) => `${sx(x)} ${sy(y)}`);
    const shade = `M${sx(7.8)} ${sy(y0)} L${stair.join(' L')} L${sx(x1)} ${sy(y0)} Z`;
    const star = (cx, cy, r) => {
      const pts = [];
      for (let i = 0; i < 10; i += 1) {
        const a = (Math.PI / 5) * i - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
      }
      return `<polygon points="${pts.join(' ')}"/>`;
    };
    const yt = [60, 64, 68, 72, 76]; const xt = narrow ? [0, 10, 20, 30] : [0, 5, 10, 15, 20, 25, 30, 35];
    const grid = yt.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}"/><text class="ax" x="${m.l - 10}" y="${sy(v) + 4}" text-anchor="end">${v}</text>`).join('')
      + xt.map((v) => `<text class="ax" x="${sx(v)}" y="${H - m.b + 20}" text-anchor="middle">${v}</text>`).join('');
    const dots = P.map((p) => {
      const cx = sx(p.cost); const cy = sy(p.score);
      const lx = cx + p.dx; const ly = cy + p.dy;
      const mark = p.ours ? star(cx, cy, 13) : `<circle cx="${cx}" cy="${cy}" r="5.5"/>`;
      return `<g class="pt${p.ours ? ' is-ours' : ''}" tabindex="0" data-tip="${esc(tipHtml(p.name, p.tip))}">${mark}
        <text x="${lx}" y="${ly}" text-anchor="${p.anchor || 'start'}">${esc(narrow ? p.short : p.name)}</text>
        <text class="pt-val" x="${lx}" y="${ly + 16}" text-anchor="${p.anchor || 'start'}">${pct(p.score)}</text></g>`;
    }).join('');
    el.innerHTML = `<header class="hero-chart-head"><h4>OSWorld 2.0</h4><span>${esc('Partial score vs. cost per task')}</span></header>
      <svg class="chart scatter hero-scatter" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc('OSWorld 2.0 Partial score against cost per task')}">
        <path class="dominated" d="${shade}"/>
        <g class="grid">${grid}</g>
        <path class="stair" d="M${stair.join(' L')}" pathLength="1"/>
        <text class="stair-label" x="${W - m.r - 4}" y="${sy(72.37) + 18}" text-anchor="end">${esc('Pareto frontier')}</text>
        <text class="ax-title" x="${(W + m.l - m.r) / 2}" y="${H - 8}" text-anchor="middle">${esc('Cost per task ($)')}</text>
        <text class="ax-title" x="13" y="${(H - m.b + m.t) / 2}" text-anchor="middle" transform="rotate(-90 13 ${(H - m.b + m.t) / 2})">${esc('Partial score (%)')}</text>
        ${dots}
      </svg>`;
    observe(el);
  }
  const heroEl = $('#hero-chart');
  if (heroEl) {
    heroChart(heroEl);
    // Redraw only when the layout crosses the narrow breakpoint.
    let wasNarrow = heroEl.clientWidth < 520;
    addEventListener('resize', () => {
      const isNarrow = heroEl.clientWidth < 520;
      if (isNarrow !== wasNarrow) { wasNarrow = isNarrow; heroChart(heroEl); }
    }, { passive: true });
  }

  /* ---------- Dumbbell: before and after on one axis ---------- */
  function dumbbell(rows, { min, max, step, unit = '' }) {
    const ticks = [];
    for (let v = min; v <= max; v += step) ticks.push(v);
    const pos = (v) => pct(v - min, max - min);
    return `<div class="chart dumbbell" style="--cols:${ticks.length - 1}">${rows.map((r) => `
      <div class="db-row" data-tip="${esc(tipHtml(r.label, r.tip || [['CUA Driver', `${r.a}${unit}`], ['HCU', `${r.b}${unit}`]]))}">
        <span class="db-label">${esc(r.label)}</span>
        <span class="db-track">
          <span class="db-line" style="left:${pos(Math.min(r.a, r.b))};--w:${pct(Math.abs(r.b - r.a), max - min)}"></span>
          <span class="db-dot is-base" style="left:${pos(r.a)}"></span>
          <span class="db-dot is-ours" style="left:${pos(r.b)}"></span>
        </span>
        <span class="db-gain">${esc(r.gain)}</span>
      </div>`).join('')}
      <div class="db-axis"><span></span><span class="cbar-ticks">${ticks.map((v) => `<i style="left:${pos(v)}">${v}${unit}</i>`).join('')}</span><span></span></div>
    </div>`;
  }

  /* ---------- One stacked bar for a channel split ---------- */
  function channelSplit(parts) {
    return `<div class="chart split"><div class="stack-bar">${parts.map(([name, v, cls]) =>
      `<span class="${cls}" style="--w:${v}%" data-tip="${esc(tipHtml(name, [['Share of calls', `${v}%`]]))}">${esc(name)} ${v}%</span>`).join('')}</div></div>`;
  }

  /* ---------- Delta grid: change per model and metric, shaded by size ---------- */
  function deltaGrid(cols, rows) {
    const cell = (v) => {
      const strength = Math.min(1, Math.abs(v) / 60);
      return `<td><span class="dg-cell" style="--a:${(0.08 + strength * 0.42).toFixed(2)}">${v > 0 ? '+' : '−'}${Math.abs(v)}%</span></td>`;
    };
    return `<div class="table-wrap"><table class="table dgrid"><thead><tr><th>${esc('Model (harness)')}</th>${cols.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr><td>${esc(r.label)}</td>${r.values.map(cell).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  /* ---------- Results data ---------- */
  const money = (d) => (v) => `$${v.toFixed(d)}`;
  const RESULTS = {
    osw2: {
      title: 'OSWorld 2.0',
      meta: [['linux', 'Linux'], [null, '108 tasks'], [null, 'Codex and Claude Code']],
      lead: 'HCU scores 72.37% Partial with GPT-6 Astra and 35.19% Binary with Claude Opus 5, the highest of all full-set systems.',
      left: () => `<section class="chart-card"><header><h4>${esc('Partial score vs. cost per task')}</h4></header>${scatter([
        { id: 'hcuA', name: 'HCU · GPT-6 Astra (Codex)', short: 'HCU · GPT-6 Astra', cost: 10.03, score: 72.37, ours: true, dy: -12, dx: 14, tip: [['Partial', '72.37%'], ['Binary', '32.40%'], ['Cost', '$10.03']] },
        { id: 'hcuO', name: 'HCU · Claude Opus 5 (Claude Code)', short: 'HCU · Opus 5', cost: 22.67, score: 72.06, ours: true, dy: -16, dx: 0, anchor: 'middle', tip: [['Partial', '72.06%'], ['Binary', '35.19%'], ['Cost', '$22.67']] },
        { id: 'cua', name: 'CUA Driver · GPT-6 Astra (Codex)', short: 'CUA Driver · GPT-6 Astra', cost: 10.05, score: 68.82, dy: 20, tip: [['Partial', '68.82%'], ['Binary', '31.50%'], ['Cost', '$10.05']] },
        { id: 'opus', name: 'Official GUI loop · Claude Opus 5', short: 'GUI loop · Opus 5', cost: 28.43, score: 68.31, dx: 0, dy: 24, anchor: 'end', tip: [['Partial', '68.31%'], ['Binary', '31.43%'], ['Cost', '$28.43']] },
        { id: 'sol', name: 'Official GUI loop · GPT-5.6 Sol', short: 'GUI loop · GPT-5.6 Sol', cost: 13.94, score: 62.72, tip: [['Partial', '62.72%'], ['Binary', '27.34%'], ['Cost', '$13.94']] },
        { id: 'sa', name: 'StateAct · Claude Opus 4.8', short: 'StateAct · Opus 4.8', cost: 7.8, score: 61.6, dy: 20, tip: [['Partial', '61.60%'], ['Binary', '26.90%'], ['Cost', '~$7.80']] },
      ], { x: [0, 32], y: [60, 74], xTicks: [0, 8, 16, 24, 32], yTicks: [60, 64, 68, 72], xLabel: 'Mean cost per task, lower is better', yLabel: 'Partial score (%)', arrows: [['cua', 'hcuA'], ['opus', 'hcuO']] })}
        <p class="chart-note">${esc('Arrows connect the same model before and after HCU.')}</p></section>`,
      right: () => `<section class="chart-card"><header><h4>${esc('Partial score')}</h4></header>${scoreBars({ max: 80, step: 20, rows: [
        { label: 'HCU · GPT-6 Astra', value: 72.37, ours: true, delta: '+3.55 pp', tip: [['Partial', '72.37%'], ['vs. CUA Driver', '+3.55 pp'], ['Tool calls', '−29.8%'], ['Task time', '−21%']] },
        { label: 'HCU · Opus 5', value: 72.06, ours: true },
        { label: 'CUA Driver · Astra', value: 68.82 },
        { label: 'GUI loop · Opus 5', value: 68.31 },
        { label: 'GUI loop · Muse Spark', value: 66.90 },
        { label: 'GUI loop · GPT-5.6 Sol', value: 62.72 },
        { label: 'StateAct · Opus 4.8', value: 61.60 },
      ] })}</section>`,
      table: () => table(['System', 'Model', 'Partial', 'Binary', 'Cost'], [
        { ours: true, cells: ['HCU (Codex)', 'GPT-6 Astra', '72.37', '32.40', '$10.03'], delta: false },
        { ours: true, cells: ['HCU (Claude Code)', 'Claude Opus 5', '72.06', '35.19', '$22.67'], delta: false },
        { cells: ['CUA Driver (Codex)', 'GPT-6 Astra', '68.82', '31.50', '$10.05'], delta: false },
        { cells: ['Official GUI loop', 'Claude Opus 5', '68.31', '31.43', '$28.43'], delta: false },
        { cells: ['Official GUI loop', 'Muse Spark 1.3', '66.90', '32.00', 'n/a'], delta: false },
        { cells: ['Official GUI loop', 'GPT-5.6 Sol', '62.72', '27.34', '$13.94'], delta: false },
        { cells: ['StateAct (0624)', 'Claude Opus 4.8', '61.60', '26.90', '~$7.80'], delta: false },
        { cells: ['Computer-use loop', 'GPT-6 Astra *', '72.60', '–', '–'], delta: false },
      ]),
      note: 'On GPT-6 Astra in Codex, HCU adds 3.55 Partial points over CUA Driver and cuts tool calls by 29.8% and task time by 21%. With Claude Opus 5, HCU costs 20.3% less than the official GUI loop. * OpenAI\'s offline-subset result, unranked.',
    },
    osw1: {
      title: 'OSWorld 1.0',
      meta: [['linux', 'Linux'], [null, '360 tasks'], [null, 'GPT-5.4 in Codex']],
      lead: 'The HCU 1.0 release scores 70.13%, 7.66 points above CUA Driver, at 59.1% lower cost.',
      left: () => `<section class="chart-card"><header><h4>${esc('Score')}</h4></header>${scoreBars({ max: 80, step: 20, rows: [
        { label: 'CUA Driver', value: 62.47 },
        { label: 'HCU, paper', value: 65.77, mid: true },
        { label: 'HCU 1.0', value: 70.13, ours: true, delta: '+7.66 pp' },
      ] })}<h5 class="chart-sub">${esc('Tasks with a full score')}</h5>${scoreBars({ max: 80, step: 20, rows: [
        { label: 'CUA Driver', value: 60.0, display: '60.00%' },
        { label: 'HCU, paper', value: 62.41, mid: true },
        { label: 'HCU 1.0', value: 66.67, ours: true, delta: '+6.67 pp' },
      ] })}<p class="chart-note">${esc('“HCU, paper” is the version evaluated in the paper; HCU 1.0 is the public release.')}</p></section>`,
      right: () => `<section class="chart-card"><header><h4>${esc('Effort and cost per task')}</h4></header>${tiles([
        { name: 'Steps', values: [40.58, 24.92], format: (v) => v.toFixed(2) },
        { name: 'Time', values: [499, 296], format: (v) => `${v} s` },
        { name: 'Input tokens', values: [2174.5, 717.7], format: (v) => (v >= 1000 ? `${(v / 1000).toFixed(2)}M` : `${Math.round(v)}K`) },
        { name: 'Cost', values: [0.983, 0.402], format: money(3) },
      ], ['CUA Driver', 'HCU 1.0'])}</section>`,
      table: () => table(['Per task', 'CUA Driver', 'HCU, paper', 'HCU 1.0', 'Change'], [
        { cells: ['Score (%)', '62.47', '65.77', '70.13', '+7.66 pp'] },
        { cells: ['Full-score tasks (%)', '60.00', '62.41', '66.67', '+6.67 pp'] },
        { cells: ['Steps', '40.58', '28.45', '24.92', '−38.6%'] },
        { cells: ['Tool calls', '33.67', '24.94', '21.63', '−35.8%'] },
        { cells: ['Execution time (s)', '499', '350', '296', '−40.7%'] },
        { cells: ['Input tokens (K)', '2,174.5', '927.1', '717.7', '−67.0%'] },
        { cells: ['Cost ($)', '0.983', '0.504', '0.402', '−59.1%'] },
      ], 3),
      note: 'CUA Driver and the paper version are three-run means.',
    },
    waa: {
      title: 'Windows Agent Arena',
      meta: [['windows', 'Windows'], [null, '111 tasks'], [null, 'GPT-5.4']],
      lead: 'Through UI Automation and Win32, HCU scores 80.86%, 8.97 points above CUA Driver, and halves the total cost.',
      left: () => `<section class="chart-card"><header><h4>${esc('Score')}</h4><span>${esc('Partial credit counts')}</span></header>${scoreBars({ max: 100, step: 20, rows: [
        { label: 'CUA Driver', value: 71.89 },
        { label: 'HCU', value: 80.86, ours: true, delta: '+8.97 pp' },
      ] })}<h5 class="chart-sub">${esc('Tasks fully solved')}</h5>${scoreBars({ max: 111, step: 37, unit: '', rows: [
        { label: 'CUA Driver', value: 78, display: '78 / 111' },
        { label: 'HCU', value: 88, ours: true, display: '88 / 111', delta: '+10' },
      ] })}</section>`,
      right: () => `<section class="chart-card"><header><h4>${esc('Effort and cost per task')}</h4></header>${tiles([
        { name: 'Steps', values: [24.45, 17.35], format: (v) => v.toFixed(2) },
        { name: 'Time', values: [344.3, 220.3], format: (v) => `${v} s` },
        { name: 'Input tokens, all tasks', values: [155.6, 50.0], format: (v) => `${v.toFixed(1)}M` },
        { name: 'Cost', values: [0.664, 0.325], format: money(3) },
      ], ['CUA Driver', 'HCU'])}</section>`,
      table: () => table(['Per task', 'CUA Driver', 'HCU', 'Change'], [
        { cells: ['Score (%)', '71.89', '80.86', '+8.97 pp'] },
        { cells: ['Tasks fully solved', '78', '88', '+10'] },
        { cells: ['Steps', '24.45', '17.35', '−29.0%'] },
        { cells: ['Tool calls', '23.81', '16.43', '−31.0%'] },
        { cells: ['Mean time (s)', '344.3', '220.3', '−36.0%'] },
        { cells: ['Input tokens, all tasks', '155.6M', '50.0M', '−67.9%'] },
        { cells: ['Cost per task ($)', '0.664', '0.325', '−51.0%'] },
        { cells: ['Total cost ($)', '73.00', '36.06', '−50.6%'] },
      ], 2),
    },
    mac: {
      title: 'MacAgentBench · UI subset',
      meta: [['apple', 'macOS'], [null, '28 UI tasks'], [null, 'GPT-5.4']],
      lead: 'Through AXUIElement and ScreenCaptureKit, HCU completes 25 tasks (CUA Driver: 24) in 37.8% less time at 51.4% lower cost.',
      left: () => `<section class="chart-card"><header><h4>${esc('Completed tasks')}</h4><span>${esc('Out of 28')}</span></header>${scoreBars({ max: 100, step: 20, rows: [
        { label: 'CUA Driver', value: 85.7, display: '24 / 28' },
        { label: 'HCU', value: 89.3, ours: true, display: '25 / 28', delta: '+3.6 pp' },
      ] })}<h5 class="chart-sub">${esc('How HCU\'s calls split on macOS')}</h5>${channelSplit([['AX', 49.8, 'ch-ax'], ['Shell', 28.6, 'ch-code'], ['GUI', 21.6, 'ch-gui']])}</section>`,
      right: () => `<section class="chart-card"><header><h4>${esc('Effort and cost per task')}</h4></header>${tiles([
        { name: 'Steps', values: [52.21, 39.61], format: (v) => v.toFixed(2) },
        { name: 'Time', values: [876.0, 544.5], format: (v) => `${v.toFixed(1)} s` },
        { name: 'Input tokens', values: [3.64, 1.34], format: (v) => `${v.toFixed(2)}M` },
        { name: 'Cost', values: [1.49, 0.725], format: money(3) },
      ], ['CUA Driver', 'HCU'])}</section>`,
      table: () => table(['Per task', 'CUA Driver', 'HCU', 'Change'], [
        { cells: ['Completed tasks', '24 / 28', '25 / 28', '+3.6 pp'] },
        { cells: ['Steps', '52.21', '39.61', '−24.1%'] },
        { cells: ['Tool calls', '44.54', '35.64', '−20.0%'] },
        { cells: ['Mean time (s)', '876.0', '544.5', '−37.8%'] },
        { cells: ['Median time (s)', '659.5', '419.3', '−36.4%'] },
        { cells: ['Input tokens', '3.64M', '1.34M', '−63.0%'] },
        { cells: ['Cost ($)', '1.490', '0.725', '−51.4%'] },
      ], 2),
    },
    weave: {
      title: 'WeaveBench',
      meta: [['linux', 'Linux'], [null, '114 long tasks'], [null, 'GPT-5.4']],
      lead: 'HCU scores 53.25%, 6.88 points above CUA Driver and 9.41 above OpenClaw, the benchmark\'s official agent.',
      left: () => `<section class="chart-card"><header><h4>${esc('Mean score')}</h4></header>${scoreBars({ max: 60, step: 10, rows: [
        { label: 'OpenClaw', value: 43.84 },
        { label: 'CUA Driver', value: 46.37 },
        { label: 'HCU', value: 53.25, ours: true, delta: '+6.88 pp' },
      ] })}<h5 class="chart-sub">${esc('Tool calls per task')}</h5>${scoreBars({ max: 120, step: 30, unit: '', rows: [
        { label: 'OpenClaw', value: 82.96 },
        { label: 'CUA Driver', value: 100.82 },
        { label: 'HCU', value: 83.03, ours: true, delta: '−17.6%' },
      ] })}<p class="chart-note">${esc('OpenClaw finishes faster than both computer-use interfaces but scores 9.41 points lower than HCU.')}</p></section>`,
      right: () => `<section class="chart-card"><header><h4>${esc('Effort and cost per task')}</h4><span>${esc('Change shown vs. CUA Driver')}</span></header>${tiles([
        { name: 'Tasks scoring ≥ 0.8', values: [23, 12, 24], baseIndex: 1, better: 'higher', format: (v) => `${v} / 114` },
        { name: 'Input tokens', values: [3.54, 8.71, 4.48], baseIndex: 1, format: (v) => `${v.toFixed(2)}M` },
        { name: 'Time', values: [21.19, 40.76, 32.59], baseIndex: 1, format: (v) => `${v.toFixed(1)} min` },
        { name: 'Cost', values: [3.672, 3.518, 1.889], baseIndex: 1, format: money(2) },
      ], ['OpenClaw', 'CUA Driver', 'HCU'])}</section>`,
      table: () => table(['Per task', 'OpenClaw', 'CUA Driver', 'HCU'], [
        { cells: ['Mean score (%)', '43.84', '46.37', '53.25'], delta: false },
        { cells: ['Tasks scoring ≥ 0.8', '23 / 114', '12 / 114', '24 / 114'], delta: false },
        { cells: ['Tool calls', '82.96', '100.82', '83.03'], delta: false },
        { cells: ['Input tokens', '3.54M', '8.71M', '4.48M'], delta: false },
        { cells: ['Mean time (min)', '21.19', '40.76', '32.59'], delta: false },
        { cells: ['Cost ($)', '3.672', '3.518', '1.889'], delta: false },
      ], 3),
    },
    models: {
      title: 'Same model, same harness, different interface',
      meta: [['linux', 'OSWorld 1.0'], [null, '4 frontier models'], [null, 'Native harnesses']],
      lead: 'Replacing CUA Driver with HCU raises the mean score by 6.48 points, with 22% fewer tool calls and 30% lower cost on average.',
      left: () => `<section class="chart-card"><header><h4>${esc('Score, CUA Driver to HCU')}</h4><span><i class="key is-base"></i>CUA Driver <i class="key is-ours"></i>HCU</span></header>${dumbbell([
        { label: 'Gemini 3.8 Flash', a: 54.67, b: 67.57, gain: '+12.90' },
        { label: 'Grok 4.7', a: 67.90, b: 74.71, gain: '+6.81' },
        { label: 'GPT-5.4', a: 62.30, b: 65.59, gain: '+3.29' },
        { label: 'Claude Opus 5.5', a: 68.68, b: 71.62, gain: '+2.94' },
      ], { min: 50, max: 80, step: 10, unit: '%' })}</section>`,
      right: () => `<section class="chart-card"><header><h4>${esc('Change with HCU')}</h4><span>${esc('Darker means a larger reduction')}</span></header>${deltaGrid(['Steps', 'Input tokens', 'Cost'], [
        { label: 'GPT-5.4 (Codex)', values: [-30, -57, -55] },
        { label: 'Claude Opus 5.5 (Claude Code)', values: [-1, -32, -8] },
        { label: 'Gemini 3.8 Flash (Gemini CLI)', values: [-17, -39, -44] },
        { label: 'Grok 4.7 (Grok Build)', values: [-22, -18, -13] },
      ])}<p class="chart-note">${esc('Ablation with GPT-5.4: without the AX channel the score drops from 65.59% to 62.79% and steps rise from 28.60 to 33.28. Without GUI, the score stays within run-to-run variation and steps rise 12%.')}</p></section>`,
    },
  };

  function renderResult(panel) {
    const r = RESULTS[panel.dataset.result];
    if (!r) return;
    const meta = r.meta.map(([icon, text]) => `<span class="meta-chip">${icon ? `<svg class="os-icon" aria-hidden="true"><use href="#i-${icon}"/></svg>` : ''}${esc(text)}</span>`).join('');
    panel.innerHTML = `
      <div class="result-lead"><div><h3>${esc(r.title)}</h3><p>${esc(r.lead)}</p></div><div class="result-meta">${meta}</div></div>
      <div class="result-grid">${r.left()}${r.right()}</div>
      ${r.table ? `<details class="numbers"><summary>${esc('All numbers')}</summary>${r.table()}${r.note ? `<p class="table-note">${esc(r.note)}</p>` : ''}</details>` : ''}`;
    observe(panel);
  }
  $$('[data-result]').forEach(renderResult);

  /* ---------- Analysis charts ---------- */
  const usage = $('#chart-usage');
  if (usage) {
    const rows = [
      ['GPT-5.4', [53.8, 26.5, 12.5, 7.2]],
      ['Grok 4.7', [38.4, 29.2, 19.0, 13.3]],
      ['Gemini 3.8 Flash', [28.0, 23.3, 38.6, 10.1]],
      ['Claude Opus 5.5', [null, 5.9, 35.1, 59.0]],
    ];
    const names = ['AX observe', 'AX act', 'GUI screenshot', 'GUI act'];
    const cls = ['seg-ax-obs', 'seg-ax-exec', 'seg-gui-obs', 'seg-gui-exec'];
    usage.innerHTML = `<div class="chart stacks">${rows.map(([model, v]) => {
      const ax = (v[0] || 0) + v[1];
      return `<div class="stack-row"><span class="stack-label">${esc(model)}<small>${ax.toFixed(1)}% AX</small></span><span class="stack-bar">${v.map((x, i) => (x == null ? '' :
        `<span class="${cls[i]}" style="--w:${x}%" data-tip="${esc(tipHtml(model, [[i === 1 && v[0] == null ? 'AX, observe and act' : names[i], `${x}%`]]))}">${x >= 8 ? x.toFixed(1) : ''}</span>`)).join('')}</span></div>`;
    }).join('')}</div>`;
    observe(usage.parentElement);
  }

  const gain = $('#chart-gain');
  if (gain) {
    gain.innerHTML = scoreBars({ max: 14, step: 2, unit: ' pp', rows: [
      { label: 'Gemini 3.8 Flash', value: 12.8, ours: true, display: '+12.8', tip: [['Total gain', '+12.90 pp'], ['From AX / GUI tasks', '+12.8'], ['From shell-only tasks', '+0.1']] },
      { label: 'Grok 4.7', value: 7.1, ours: true, display: '+7.1', tip: [['Total gain', '+6.81 pp'], ['From AX / GUI tasks', '+7.1'], ['From shell-only tasks', '−0.2']] },
      { label: 'GPT-5.4', value: 4.0, ours: true, display: '+4.0', tip: [['Total gain', '+3.29 pp'], ['From AX / GUI tasks', '+4.0'], ['From shell-only tasks', '−0.7']] },
      { label: 'Claude Opus 5.5', value: 3.4, ours: true, display: '+3.4', tip: [['Total gain', '+2.94 pp'], ['From AX / GUI tasks', '+3.4'], ['From shell-only tasks', '−0.5']] },
    ] });
    observe(gain.parentElement);
  }

  const desk = $('#chart-desktop');
  if (desk) {
    desk.innerHTML = dumbbell([
      { label: 'Claude Opus 5.5', a: 24.4, b: 45.0, gain: '+20.6', tip: [['CUA Driver', '24.4% of tasks'], ['HCU', '45.0% of tasks'], ['Batched acting requests', '58%']] },
      { label: 'GPT-5.4', a: 57.0, b: 73.6, gain: '+16.6', tip: [['CUA Driver', '57.0% of tasks'], ['HCU', '73.6% of tasks'], ['Batched acting requests', '17%']] },
      { label: 'Grok 4.7', a: 67.6, b: 81.2, gain: '+13.6', tip: [['CUA Driver', '67.6% of tasks'], ['HCU', '81.2% of tasks'], ['Batched acting requests', '21%']] },
      { label: 'Gemini 3.8 Flash', a: 85.3, b: 86.7, gain: '+1.4', tip: [['CUA Driver', '85.3% of tasks'], ['HCU', '86.7% of tasks'], ['Batched acting requests', '11%']] },
    ], { min: 0, max: 100, step: 25, unit: '%' });
    observe(desk.parentElement);
  }
})();
