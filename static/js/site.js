// Hybrid Computer Use project page: tabs, navigation state, and the demos.
(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  // zh.html loads window.HCU_I18N; on English pages tr() returns the source string.
  const I18N = window.HCU_I18N || {};
  const tr = (s) => (Object.prototype.hasOwnProperty.call(I18N, s) ? I18N[s] : s);
  const tf = (s, ...args) => tr(s).replace(/\{(\d)\}/g, (_, i) => args[i]);

  /* ---------- Code rendering ----------
     One small highlighter for the formats on this page: JSON tool calls, Python,
     AX working trees, logs, and AX diffs. It tokenizes raw text, then escapes. */
  const TOKEN_RE = new RegExp([
    '(\\/\\/[^\\n]*|(?:^|(?<=\\s))#[^\\n]*)', // 1 comment
    '("(?:[^"\\\\\\n]|\\\\.)*")(?=\\s*:)', // 2 JSON key
    '("(?:[^"\\\\\\n]|\\\\.)*")', // 3 string
    '(\\[ref=[awr]\\d+\\]|\\b[awr]\\d{1,3}\\b(?![.\\w]))', // 4 HCU ref
    '\\b(import|from|for|in|if|else|not|continue|as|def|return|assert|with|true|false|null|None|True|False)\\b', // 5 keyword
    '\\b(AX|GUI|AX_ACT)(?=\\()', // 6 tool name
    '(-?\\b\\d+(?:[.,]\\d+)*\\b)', // 7 number
    '\\b(ok|met)\\b', // 8 passed check
    '\\b(not found|stale_ref)\\b', // 9 failed check
  ].join('|'), 'gm');
  const REF_ONLY = /^"[awr]\d{1,3}"$/;

  let pyMode = false; // keywords only matter in Python snippets
  function highlightLine(line) {
    let out = '';
    let last = 0;
    line.replace(TOKEN_RE, (m, com, key, str, ref, kw, fn, num, pass, fail, offset) => {
      out += esc(line.slice(last, offset));
      last = offset + m.length;
      if (kw && !pyMode) { out += esc(m); return m; }
      let cls = com ? 'com' : key ? 'key' : str ? (REF_ONLY.test(str) ? 'ref' : 'str') : ref ? 'ref' : kw ? 'kw' : fn ? 'fn' : num ? 'num' : pass ? 'ok' : 'fail';
      out += `<span class="tk-${cls}">${esc(m)}</span>`;
      return m;
    });
    return out + esc(line.slice(last));
  }

  // HCU diffs either tag lines (<added>, <removed>, <changed>) or prefix them with +, -, ~.
  // In tagged diffs a leading "-" is only a tree bullet, so tags take precedence.
  function diffClass(line, tagged) {
    if (tagged) {
      const m = line.match(/<(added|removed|changed)>/);
      return m ? { added: 'add', removed: 'del', changed: 'mod' }[m[1]] : '';
    }
    const m = line.match(/^\s*([+~-])\s/);
    return m ? { '+': 'add', '-': 'del', '~': 'mod' }[m[1]] : '';
  }

  function highlight(text) {
    let inDiff = false;
    pyMode = /^\s*(import|from|def|for)\s/m.test(text);
    const tagged = /<(added|removed|changed)>/.test(text);
    return String(text).split('\n').map((line) => {
      if (/ax_diff|^diff\b/.test(line)) inDiff = true;
      else if (!line.trim()) inDiff = false;
      const html = highlightLine(line);
      const cls = inDiff ? diffClass(line, tagged) : '';
      const indent = line.match(/^ */)[0].length;
      const style = indent ? ` style="--i:${indent}"` : '';
      return `<span class="ln${cls ? ` ln-${cls}` : ''}"${style}>${html}</span>`;
    }).join('');
  }

  /* Data titles were written in Title Case; the page uses sentence case throughout.
     Words with inner capitals, digits, quoted text, and product names keep their case. */
  const KEEP = new Set(['Chrome', 'GIMP', 'Writer', 'Calc', 'LibreOffice', 'Zotero', 'Obsidian', 'VLC', 'Qt', 'OK', 'Cancel', 'Ctrl', 'CTRL', 'Save', 'Thunderbird', 'Audacity', 'Impress', 'Hepatitis', 'VS', 'Code', 'Linux', 'macOS', 'Windows', 'Python', 'Swift', 'Go', 'Win32', 'Winsock', 'FlaUI', 'ScreenCaptureKit', 'CoreGraphics', 'AXUIElement', 'Unix']);
  function sentence(str) {
    let first = true;
    return String(str).replace(/—/g, ', ').split(/("[^"]*")/).map((part) => {
      if (part.startsWith('"')) { first = false; return part; }
      return part.replace(/[A-Za-z][\w'-]*/g, (w) => {
        const keep = first || KEEP.has(w) || /[A-Z].*[A-Z]|\d/.test(w) || !/^[A-Z][a-z'-]+$/.test(w);
        first = false;
        return keep ? w : w.toLowerCase();
      });
    }).join('');
  }

  // Expand long single-line JSON objects (optionally after a "[ax] " prefix) for reading.
  function prettyJson(text) {
    return String(text).split('\n').map((line) => {
      const at = line.indexOf('{');
      if (at < 0 || line.length - at < 70) return line;
      try {
        return line.slice(0, at) + JSON.stringify(JSON.parse(line.slice(at)), null, 2);
      } catch {
        return line;
      }
    }).join('\n');
  }

  function setCode(el, text) {
    if (!el) return;
    el.innerHTML = highlight(prettyJson(text));
  }

  // Static blocks on the page.
  for (const pre of $$('pre.code')) {
    setCode(pre, pre.textContent);
  }

  // Copy buttons for code blocks that have a title bar.
  for (const title of $$('.code-title')) {
    const pre = title.nextElementSibling;
    if (!pre || !pre.matches('pre')) continue;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'code-copy';
    btn.setAttribute('aria-label', tr('Copy code'));
    btn.innerHTML = `<svg><use href="#i-copy"/></svg><span>${tr('Copy')}</span>`;
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        btn.lastChild.textContent = tr('Copied');
      } catch {
        btn.lastChild.textContent = tr('Failed');
      }
      setTimeout(() => { btn.lastChild.textContent = tr('Copy'); }, 1400);
    });
    title.appendChild(btn);
  }

  /* ---------- Tabs (WAI-ARIA tablist with arrow-key navigation) ---------- */
  function selectTab(tab, focus = false) {
    const list = tab.closest('[role="tablist"]');
    for (const t of $$('[role="tab"]', list)) {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    }
    if (focus) tab.focus();
    tab.dispatchEvent(new CustomEvent('tab:select', { bubbles: true }));
  }
  for (const list of $$('[role="tablist"]')) {
    const tabs = $$('[role="tab"]', list);
    list.addEventListener('click', (e) => {
      const tab = e.target.closest('[role="tab"]');
      if (tab) selectTab(tab);
    });
    list.addEventListener('keydown', (e) => {
      const i = tabs.indexOf(document.activeElement);
      if (i < 0) return;
      const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
      if (next === undefined) return;
      e.preventDefault();
      selectTab(tabs[(next + tabs.length) % tabs.length], true);
    });
  }
  // Scoreboard cards open the matching results tab.
  for (const link of $$('[data-result-tab]')) {
    link.addEventListener('click', () => {
      const tab = document.getElementById(`tab-${link.dataset.resultTab}`);
      if (tab) selectTab(tab);
    });
  }

  /* ---------- Navigation state ---------- */
  const navLinks = $$('.nav-links a');
  const sections = navLinks.map((a) => document.getElementById(a.hash.slice(1))).filter(Boolean);
  if ('IntersectionObserver' in window) {
    const spy = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const a of navLinks) {
          if (a.hash === `#${entry.target.id}`) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        }
      }
    }, { rootMargin: '-45% 0px -50% 0px' });
    sections.forEach((s) => spy.observe(s));

  }

  /* ---------- Image viewer ---------- */
  const viewer = $('#viewer');
  function openViewer(src, title) {
    if (!viewer) return;
    $('#viewer-img').src = src;
    $('#viewer-img').alt = title;
    $('#viewer-title').textContent = title;
    viewer.showModal();
  }
  if (viewer) {
    $('#viewer-close').addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', (e) => { if (e.target === viewer) viewer.close(); });
  }

  for (const fig of $$('.subagents figure')) {
    fig.addEventListener('click', () => {
      const img = $('img', fig);
      openViewer(img.dataset.full || img.src, $('figcaption strong', fig).textContent);
    });
  }

  /* ---------- Chip groups ---------- */
  function renderChips(container, items, current, onPick) {
    container.innerHTML = items.map(([key, label, note]) =>
      `<button class="chip" type="button" data-key="${key}" aria-pressed="${key === current}">${esc(label)}${note ? ` <small>${esc(note)}</small>` : ''}</button>`
    ).join('');
    container.onclick = (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      for (const c of $$('.chip', container)) c.setAttribute('aria-pressed', String(c === chip));
      onPick(chip.dataset.key);
    };
  }

  /* ---------- Section data: load a script when its section comes within two screens ---------- */
  function whenNear(selector, src, start) {
    const el = $(selector);
    if (!el) return;
    const load = () => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = start;
      document.head.append(script);
    };
    if (!('IntersectionObserver' in window)) { load(); return; }
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      load();
    }, { rootMargin: '200% 0px' });
    io.observe(el);
  }

  /* ---------- AX atlas ---------- */
  whenNear('#atlas', 'static/js/ax-atlas-data.js', function atlas() {
    const scenes = window.AX_ATLAS_SCENES;
    const tree = $('#atlas-tree');
    if (!scenes || !tree) return;
    const shot = $('#atlas-shot');
    const img = $('#atlas-img');
    const svg = $('#atlas-svg');
    const filter = $('#atlas-filter');
    const refRe = /\[ref=(r\d+)\]/;
    let scene = null;
    let active = null;
    let lines = new Map();
    let rects = new Map();

    function highlight(ref, fromShot, instant) {
      if (!scene || ref === active) return;
      if (active) {
        lines.get(active)?.classList.remove('is-active');
        rects.get(active)?.classList.remove('is-active');
      }
      active = ref;
      const line = lines.get(ref);
      line?.classList.add('is-active');
      rects.get(ref)?.classList.add('is-active');
      const m = scene.meta[ref] || {};
      const f = scene.frames[ref];
      $('#atlas-ref').textContent = `[ref=${ref}]`;
      $('#atlas-role').textContent = `${m.role || 'control'}${m.name ? ` "${m.name}"` : ''}`;
      $('#atlas-meta').textContent = f ? `x ${f[0]}, y ${f[1]}, ${f[2]} × ${f[3]}${m.actions && m.actions.length ? ` · ${m.actions.join(', ')}` : ''}` : '';
      // Scroll only the tree panel, never the page.
      if (fromShot && line) {
        const top = line.getBoundingClientRect().top - tree.getBoundingClientRect().top + tree.scrollTop - tree.clientHeight / 2 + line.clientHeight / 2;
        tree.scrollTo({ top, behavior: reduceMotion || instant ? 'auto' : 'smooth' });
      }
    }

    // The stage shows a 1440 px WebP; the full-size capture is kept for the viewer.
    const viewSrc = (s) => s.image.src.replace(/atlas\/([^/]+)\.\w+$/, 'atlas/view/$1.webp');
    const decoded = new Map();
    function prefetch(key) {
      if (!decoded.has(key)) {
        const im = new Image();
        im.src = viewSrc(scenes[key]);
        decoded.set(key, im.decode().catch(() => {}));
      }
      return decoded.get(key);
    }

    // Swap image, boxes, and tree in one frame, after the new image is decoded,
    // so the boxes never sit on top of the previous capture.
    let pending = null;
    async function load(key) {
      pending = key;
      const ready = prefetch(key);
      const slow = setTimeout(() => shot.classList.add('is-loading'), 120);
      await ready;
      clearTimeout(slow);
      shot.classList.remove('is-loading');
      if (pending === key) render(key);
    }

    function render(key) {
      scene = scenes[key];
      active = null;
      $('#atlas-title').textContent = tr(sentence(scene.title));
      img.width = scene.image.w;
      img.height = scene.image.h;
      img.src = viewSrc(scene);
      img.alt = tf('{0}, screen capture', tr(sentence(scene.title)));
      svg.setAttribute('viewBox', `0 0 ${scene.image.w} ${scene.image.h}`);

      const frag = document.createDocumentFragment();
      lines = new Map();
      for (const text of scene.lines) {
        const div = document.createElement('div');
        div.className = 'tree-line';
        const m = text.match(refRe);
        if (m) {
          div.dataset.ref = m[1];
          div.innerHTML = highlightLine(text);
          lines.set(m[1], div);
        } else {
          div.innerHTML = highlightLine(text);
        }
        div.title = text;
        frag.appendChild(div);
      }
      tree.replaceChildren(frag);
      tree.scrollTop = 0;

      // Larger boxes first so smaller controls stay on top and clickable.
      const area = scene.image.w * scene.image.h;
      const entries = Object.entries(scene.frames)
        .filter(([, [, , w, h]]) => w > 0 && h > 0 && w * h < area * 0.85)
        .sort((a, b) => b[1][2] * b[1][3] - a[1][2] * a[1][3]);
      rects = new Map();
      svg.innerHTML = entries.map(([ref, [x, y, w, h]]) =>
        `<rect class="atlas-box" data-ref="${ref}" x="${x}" y="${y}" width="${Math.max(w, 8)}" height="${Math.max(h, 8)}" rx="3"></rect>`
      ).join('');
      for (const r of $$('rect', svg)) rects.set(r.dataset.ref, r);

      // Three ways to show the same window: pixels, the tree the OS returns, and HCU's view.
      const tok = scene.tokens;
      const rows = [
        [`${tr('Screenshot')} <small>1080p</small>`, tok.screenshot_1080p, 'is-shot'],
        [tr('Raw AX tree'), tok.raw_provider, 'is-raw'],
        [tr('HCU AX view'), tok.working_compact, 'is-ours'],
      ];
      const max = Math.max(...rows.map((r) => r[1]));
      const ratio = tok.raw_provider / tok.working_compact;
      $('#atlas-tokens').innerHTML = `<div class="tok-rows">${rows.map(([name, v, cls]) =>
          `<div class="tok-row ${cls}"><span>${name}</span><span class="tok-track"><i style="width:${((v / max) * 100).toFixed(1)}%"></i></span><b>${tf('{0} tokens', v.toLocaleString())}</b></div>`).join('')}
        </div>
        <div class="tok-delta"><strong>${tf('{0}× smaller', ratio.toFixed(1))}</strong><span>${tf('than the raw AX tree, with {0} controls the model can act on by ref', scene.counts.refs)}</span></div>`;
      applyFilter();
      highlight(scene.default_ref, true, true);
    }

    function applyFilter() {
      const q = filter.value.trim().toLowerCase();
      for (const div of tree.children) div.classList.toggle('is-dim', !!q && !div.textContent.toLowerCase().includes(q));
    }

    tree.addEventListener('mouseover', (e) => { const l = e.target.closest('[data-ref]'); if (l) highlight(l.dataset.ref, false); });
    tree.addEventListener('click', (e) => { const l = e.target.closest('[data-ref]'); if (l) highlight(l.dataset.ref, false); });
    svg.addEventListener('mouseover', (e) => { const r = e.target.closest('rect'); if (r) highlight(r.dataset.ref, true); });
    svg.addEventListener('click', (e) => { const r = e.target.closest('rect'); if (r) highlight(r.dataset.ref, true); });
    filter.addEventListener('input', applyFilter);
    $('#atlas-boxes').addEventListener('change', (e) => shot.classList.toggle('hide-idle', !e.target.checked));
    $('#atlas-expand').addEventListener('click', () => openViewer(scene.image.src, `${scene.title} · ${scene.image.w} × ${scene.image.h}`));

    const keys = Object.keys(scenes);
    const LABEL = { calc_grid: 'Calc sheet', calc_dialog: 'Calc dialog' };
    const chips = $('#atlas-scenes');
    renderChips(chips, keys.map((k) => [k, tr(LABEL[k] || scenes[k].badge.split('·').pop().trim())]), 'chrome_site', load);
    chips.addEventListener('pointerover', (e) => { const c = e.target.closest('.chip'); if (c) prefetch(c.dataset.key); });
    render('chrome_site');
    // Warm the other captures (about 450 KB in total) once the section is near.
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
        idle(() => keys.forEach(prefetch));
      }, { rootMargin: '600px 0px' });
      io.observe(shot);
    }
  });

  /* ---------- Batched execution replay ----------
     Three screens run on one shared clock, so readers can watch all interfaces at once.
     The lanes under the screens show the same clock as one bar per model turn. */
  whenNear('#batching', 'static/js/demo-data.js', function race() {
    const data = window.HCU_RACE;
    const screensEl = $('#race-screens');
    const lanesEl = $('#race-lanes');
    if (!data || !screensEl || !lanesEl) return;
    const NAMES = {
      calc_format: 'Calc · Format cells',
      calc_cells: 'Calc · Fill cells',
      zotero_bib: 'Zotero · Edit fields',
      obsidian_table: 'Obsidian · Edit table',
      vlc_prefs: 'VLC · Preferences',
      chrome_clear: 'Chrome · Clear data',
    };
    const COLOR = { gui: 'var(--gui)', cua: '#616161', hcu: 'var(--brand)' };
    const THINK = 0.8; // share of a turn spent waiting for the model before actions run
    const SPEED = 6; // seconds of task time per real second
    const playBtn = $('#race-play');
    const scrub = $('#race-scrub');
    const playhead = $('#race-playhead');
    const clock = $('#race-clock');
    let lanes = [];
    let scenario = null;
    let total = 1;
    let t = 0;
    let playing = false;
    let selected = 'hcu';
    let picked = null; // { lane, index } after the reader clicks a turn
    let lastCall = ''; // the turn shown in the call panel, so frames do not re-render it

    const strip = (s) => s.replace(/^T\d+:\s*/, '');
    const fmtTok = (k) => `${k.toFixed(1)}K`;

    // Each lane lists its turns as [channel, seconds, K tokens returned, changes done after the turn].
    function buildLanes(s) {
      const nAct = s.targets.length;
      const mk = (key, name, sub, side) => {
        let start = 0;
        const items = side.plan.map(([ch, dur, tok, acts], i) => {
          const item = { text: strip(side.turns[i]), ch, start, dur, tok, acts };
          start += dur;
          return item;
        });
        return { key, name, sub, side, items, total: start, nAct };
      };
      return [
        mk('gui', tr('Pure GUI'), tr('Screenshot, then click'), s.gui),
        mk('cua', 'CUA Driver', tr('One action per call'), s.cua),
        mk('hcu', 'HCU', tr('AX batches, GUI for pixels'), s.hcu),
      ];
    }

    function screenSvg(s, r) {
      const [cx, cy, cw, ch] = s.crop;
      const targets = s.targets.map((tg) => {
        const [x, y, w, h] = tg.box;
        const px = Math.max(cx + r + 2, x);
        const py = Math.max(cy + r + 2, y);
        return `<g class="race-target${tg.ch === 'gui' ? ' is-gui-step' : ''}" data-step="${tg.step}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r * 0.3}"></rect>` +
          `<circle cx="${px}" cy="${py}" r="${r}"></circle><text x="${px}" y="${py}" style="font-size:${(r * 1.15).toFixed(1)}px">${tg.step}</text></g>`;
      }).join('');
      return `<svg class="rs-svg" viewBox="${cx} ${cy} ${cw} ${ch}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(tr(sentence(s.title.replace(/^Scenario \d+:\s*/, ''))))}">` +
        `<image href="${s.view.src}" x="${s.view.x}" y="${s.view.y}" width="${s.view.w}" height="${s.view.h}"></image>${targets}</svg>`;
    }

    // Each scenario shows one small pre-cropped image. Decode it before the swap, so the
    // three screens change in one frame instead of showing empty boxes first.
    const decoded = new Map();
    function prefetch(key) {
      if (!decoded.has(key)) {
        const im = new Image();
        im.src = data[key].view.src;
        decoded.set(key, im.decode().catch(() => {}));
      }
      return decoded.get(key);
    }
    let pendingKey = null;
    async function show(key, autoplay) {
      pendingKey = key;
      await prefetch(key);
      if (pendingKey !== key) return;
      load(key);
      if (autoplay) play();
    }

    function load(key) {
      scenario = data[key];
      const s = scenario;
      lanes = buildLanes(s);
      total = Math.max(...lanes.map((l) => l.total));
      picked = null;
      $('#race-title').textContent = tr(sentence(s.title.replace(/^Scenario \d+:\s*/, '')));
      $('#race-steps').innerHTML = s.targets.map((tg) => `<li><b>${tg.step}</b>${esc(tr(tg.short))} <code>${tg.ref}</code></li>`).join('');

      const r = Math.max(8, s.crop[2] * 0.026);
      const svg = screenSvg(s, r);
      screensEl.innerHTML = lanes.map((l) => `
        <figure class="race-screen is-${l.key}" data-lane="${l.key}" tabindex="0" aria-pressed="${l.key === selected}" style="--lane-c:${COLOR[l.key]}">
          <header class="rs-head">
            <div><strong>${l.name}</strong><span>${l.sub}</span></div>
            <span class="rs-status"></span>
          </header>
          <div class="rs-progress"><i></i></div>
          <div class="rs-shot">${svg}</div>
          <dl class="rs-meta">
            <div><dt>${tr('Changes')}</dt><dd class="rs-acts"></dd></div>
            <div><dt>${tr('Turns')}</dt><dd class="rs-turns"></dd></div>
            <div><dt>${tr('Tokens')}</dt><dd class="rs-tok"></dd></div>
          </dl>
          <figcaption class="rs-now"><span class="rs-phase"></span><span class="rs-text"></span></figcaption>
        </figure>`).join('');

      lanesEl.innerHTML = lanes.map((l) => `
        <div class="lane is-${l.key}" data-lane="${l.key}" aria-pressed="${l.key === selected}" style="--lane-c:${COLOR[l.key]}">
          <div class="lane-name"><strong>${l.name}</strong></div>
          <div class="lane-track">${l.items.map((it, i) =>
            `<span class="turn${l.key === 'hcu' && it.ch === 'gui' ? ' is-gui' : ''}" data-i="${i}" title="${esc(tf('Turn {0}', i + 1))}: ${esc(it.text)}" style="left:${(it.start / total) * 100}%;width:calc(${(it.dur / total) * 100}% - 3px)"></span>`).join('')}
          </div>
          <div class="lane-stat"><strong></strong></div>
        </div>`).join('');

      for (const l of lanes) {
        const sc = $(`.race-screen[data-lane="${l.key}"]`, screensEl);
        l.screen = sc;
        l.targets = $$('.race-target', sc);
        l.status = $('.rs-status', sc);
        l.bar = $('.rs-progress i', sc);
        l.acts = $('.rs-acts', sc);
        l.turnsEl = $('.rs-turns', sc);
        l.tokEl = $('.rs-tok', sc);
        l.phase = $('.rs-phase', sc);
        l.text = $('.rs-text', sc);
        l.lane = $(`.lane[data-lane="${l.key}"]`, lanesEl);
        l.turnEls = $$('.turn', l.lane);
        l.laneStat = $('.lane-stat strong', l.lane);
        l.laneStat.textContent = `${Math.round(l.total)} s`;
        l.prev = null;
      }
      const step = total > 60 ? 20 : 10;
      const ticks = [];
      for (let v = 0; v <= total; v += step) ticks.push(v);
      $('#race-axis').innerHTML = ticks.map((v) => `<span style="left:${(v / total) * 100}%">${v} s</span>`).join('');
      buildMotion();
      setTime(0);
      renderCode();
    }

    // The playhead and the progress bars move as Web Animations on the compositor. The
    // frame loop reads the playhead's time and touches the DOM only when a turn changes.
    let motion = [];
    const toMs = (sec) => (sec / SPEED) * 1000;
    function buildMotion() {
      motion.forEach((a) => a.cancel());
      const run = (el, from, to, sec) => el.animate([{ transform: from }, { transform: to }], { duration: toMs(sec), fill: 'both', easing: 'linear' });
      motion = [run(playhead, 'translateX(0%)', 'translateX(100%)', total),
        ...lanes.map((l) => run(l.bar, 'scaleX(0)', 'scaleX(1)', l.total))];
      motion.forEach((a) => a.pause());
    }
    function syncMotion() {
      motion.forEach((a) => { a.currentTime = toMs(t); });
    }

    const doneTurns = (l, time) => l.items.filter((it) => it.start + it.dur <= time + 1e-6).length;

    function updateLane(l) {
      const k = doneTurns(l, t);
      const n = l.items.length;
      const finished = k === n;
      const cur = finished ? null : l.items[k];
      const started = cur && t > cur.start;
      const acting = started && (t - cur.start) / cur.dur >= THINK;
      const done = k ? l.items[k - 1].acts : 0;
      const tok = l.items.slice(0, k).reduce((a, it) => a + it.tok, 0);
      // Only touch the DOM when the visible state changes.
      const state = `${k}|${started ? 1 : 0}|${acting ? 1 : 0}`;
      if (state === l.prev) return;
      l.turnEls.forEach((el, i) => {
        el.classList.toggle('is-done', i < k);
        el.classList.toggle('is-active', i === k && started);
      });
      const grew = l.prev !== null && done > l.lastDone;
      l.prev = state;
      l.targets.forEach((g, i) => {
        const nStep = i + 1;
        g.classList.toggle('is-done', nStep <= done);
        g.classList.toggle('is-next', !finished && nStep === done + 1);
        if (grew && playing && nStep > l.lastDone && nStep <= done) {
          g.classList.remove('pop');
          void g.getBBox();
          g.classList.add('pop');
        }
      });
      l.lastDone = done;
      l.screen.classList.toggle('is-finished', finished);
      l.screen.classList.toggle('is-acting', !!acting);
      l.status.textContent = finished ? tf('Done · {0} s', Math.round(l.total)) : tf('Turn {0} of {1}', Math.min(k + 1, n), n);
      l.acts.textContent = `${done} / ${l.nAct}`;
      l.turnsEl.textContent = `${k} / ${n}`;
      l.tokEl.textContent = fmtTok(tok);
      if (finished) {
        l.phase.textContent = tr('Finished');
        l.text.textContent = '';
        l.text.title = '';
      } else {
        l.phase.textContent = tr(!started ? 'Next' : acting ? 'Acting' : 'Waiting for model');
        l.text.textContent = cur.text;
        l.text.title = cur.text;
      }
    }

    function setTime(time, fromMotion) {
      t = Math.max(0, Math.min(total, time));
      if (!fromMotion) syncMotion();
      scrub.value = String(Math.round((t / total) * 1000));
      const secs = `${Math.round(t)} s`;
      if (clock.textContent !== secs) clock.textContent = secs;
      lanes.forEach(updateLane);
      if (!picked) renderCall();
    }

    function renderCall() {
      const lane = lanes.find((l) => l.key === (picked ? picked.lane : selected));
      const k = doneTurns(lane, t);
      let i = picked ? picked.index : Math.min(k, lane.items.length - 1);
      i = Math.max(0, i);
      const callKey = `${scenario.title}|${lane.key}|${i}|${picked ? 1 : 0}`;
      if (callKey === lastCall) return;
      lastCall = callKey;
      $('#race-call-title').textContent = `${lane.name} · ${tf('turn {0} of {1}', i + 1, lane.items.length)}`;
      setCode($('#race-call'), lane.items[i].text);
      for (const l of lanes) l.turnEls.forEach((el, j) => el.classList.toggle('is-picked', !!picked && l === lane && j === i));
    }

    function renderCode() {
      const lane = lanes.find((l) => l.key === selected);
      $('#race-code-title').textContent = `${lane.name} · ${tr('all calls')}`;
      setCode($('#race-code'), lane.side.code + (lane.side.diff ? `\n\n// Returned\n${lane.side.diff}` : ''));
    }

    function selectLane(key) {
      selected = key;
      for (const l of lanes) {
        l.screen.setAttribute('aria-pressed', String(l.key === key));
        l.lane.setAttribute('aria-pressed', String(l.key === key));
      }
      renderCode();
      renderCall();
    }

    // Exactly one frame loop at a time: pause() cancels the pending frame, so a
    // pause followed by play() cannot leave a second loop running.
    let frame = 0;
    function tick() {
      frame = 0;
      setTime((motion[0].currentTime / 1000) * SPEED, true);
      if (t >= total) { pause(); return; }
      frame = requestAnimationFrame(tick);
    }
    function play() {
      if (t >= total) setTime(0);
      picked = null;
      playing = true;
      playBtn.innerHTML = `<svg><use href="#i-pause"/></svg><span>${tr('Pause')}</span>`;
      syncMotion();
      motion.forEach((a) => a.play());
      if (!frame) frame = requestAnimationFrame(tick);
    }
    function pause() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      playing = false;
      motion.forEach((a) => a.pause());
      playBtn.innerHTML = `<svg><use href="#i-play"/></svg><span>${tr(t >= total ? 'Replay' : 'Play')}</span>`;
    }

    playBtn.addEventListener('click', () => (playing ? pause() : play()));
    $('#race-restart').addEventListener('click', () => { pause(); picked = null; setTime(0); play(); });
    scrub.addEventListener('input', () => { pause(); picked = null; setTime((Number(scrub.value) / 1000) * total); });
    screensEl.addEventListener('click', (e) => {
      const sc = e.target.closest('.race-screen');
      if (sc) { picked = null; selectLane(sc.dataset.lane); }
    });
    screensEl.addEventListener('keydown', (e) => {
      const sc = e.target.closest('.race-screen');
      if (sc && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); picked = null; selectLane(sc.dataset.lane); }
    });
    lanesEl.addEventListener('click', (e) => {
      const laneEl = e.target.closest('.lane');
      if (!laneEl) return;
      const turn = e.target.closest('.turn');
      picked = turn ? { lane: laneEl.dataset.lane, index: Number(turn.dataset.i) } : null;
      selectLane(laneEl.dataset.lane);
    });

    const keys = Object.keys(data);
    const scenesEl = $('#race-scenes');
    renderChips(scenesEl, keys.map((k) => [k, tr(NAMES[k] || k)]), keys[0], (k) => { pause(); show(k, !reduceMotion); });
    scenesEl.addEventListener('pointerover', (e) => { const c = e.target.closest('.chip'); if (c) prefetch(c.dataset.key); });
    if ('IntersectionObserver' in window) {
      const warm = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        warm.disconnect();
        (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(() => keys.forEach(prefetch));
      }, { rootMargin: '800px 0px' });
      warm.observe(screensEl);
    }
    load(keys[0]);
    setTime(total);
    pause();

    // Play once, the first time most of the replay is on screen. A replay that leaves
    // the screen or a hidden tab pauses, and resumes when it is back.
    if (!reduceMotion && 'IntersectionObserver' in window) {
      let started = false;
      let resume = false;
      let visible = false;
      const sync = () => {
        const on = visible && !document.hidden;
        if (on && !started) { started = true; setTime(0); play(); return; }
        if (!on && playing) { resume = true; pause(); } else if (on && resume) { resume = false; play(); }
      };
      new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; sync(); }, { threshold: 0.35 }).observe($('#panel-race'));
      document.addEventListener('visibilitychange', sync);
    }
  });

  /* ---------- Architecture: one call traced through the stack ---------- */
  (function trace() {
    const list = $('#trace');
    if (!list) return;
    // Two calls traced through the same layers: an AX click and a GUI drag.
    // Each can meet a desktop that changed after the model last looked.
    const AX_ARGS = '{"mode": "act", "actions": [\n  {"type": "click", "ref": "r13"},\n  {"type": "wait", "window": "Save As", "gone": true}]}';
    const GUI_ARGS = '{"actions": [\n  {"type": "drag", "path": [{"x": 420, "y": 310},\n                           {"x": 610, "y": 430}]},\n  {"type": "keypress", "keys": ["DELETE"]}]}';
    const ENTRY = {
      mcp: { name: 'MCP server', desc: 'The agent calls the tool over stdio.',
        ax: `AX(${AX_ARGS})`, gui: `GUI(${GUI_ARGS})` },
      cli: { name: 'CLI', desc: 'A script runs one command, and the CLI sends the command to the daemon.',
        ax: 'computer-use click r13 \\\n  --wait \'{"window": "Save As", "gone": true}\'',
        gui: `computer-use gui --json '${GUI_ARGS.replace(/\n\s*/g, '')}'` },
      sdk: { name: 'Python SDK', desc: 'Python code sends the call to the same daemon.',
        ax: 'd = hcu.connect()\nd.click("r13", wait={"window": "Save As", "gone": True})',
        gui: 'd.gui([{"type": "drag", "path": [{"x": 420, "y": 310},\n                                {"x": 610, "y": 430}]},\n       {"type": "keypress", "keys": ["DELETE"]}])' },
    };
    const TASK = {
      ax: 'Click Save in the Save As dialog, then wait until the dialog closes.',
      gui: 'Drag a selection on the GIMP canvas, then press Delete.',
    };
    const NATIVE = {
      ax: 'Linux    Atspi.Action.do_action(i)\nmacOS    AXUIElementPerformAction(kAXPressAction)\nWindows  InvokePattern.Invoke()',
      gui: 'Linux    XTest pointer and key events\nmacOS    CGEvent posted to the HID tap\nWindows  SendInput()',
    };
    const CASES = {
      ax: {
        check: 'mode act · 2 steps · window w2 from r13 · schema ok',
        guardOk: ['r13 is still the Save button in the Save As dialog.', 'r13 button "Save" in w2 "Save As"   ok'],
        guardBlock: ['A format prompt replaced the dialog. HCU stops before any input.', 'r13 not found · w2 replaced by "Keep current format"'],
        resultOk: ['Effects and windows', 'Each target\'s change, without a new screenshot.',
          '{"ok":true,"input_emitted":true,\n "completed":2,"requested":2}\neffect: r13 button "Save" gone\nwindows: closed w2 "Save As"; focus w1'],
        resultErr: ['Typed error with a hint', 'The hint is the next call to make.',
          '{"ok":false,"code":"stale_ref",\n "hint":"{\\"mode\\":\\"find\\",\\"window_ref\\":\\"wN\\",...}",\n "input_emitted":false,"completed":0,"requested":2}'],
      },
      gui: {
        check: '2 actions · drag, keypress · schema ok',
        guardOk: ['The window under each point matches the last screenshot.', '(420, 310) and (610, 430): canvas window unchanged   ok'],
        guardBlock: ['A dialog now covers the start point. HCU sends nothing.', '(420, 310): "Scale Image" dialog is on top · frame stale'],
        resultOk: ['One final screenshot', 'One image after the whole batch, not one per action.',
          '{"ok":true,"input_emitted":true,\n "completed":2,"requested":2,\n "screen":{"width":1366,"height":768,...}}\n# final screenshot'],
        resultErr: ['Fresh screenshot to replan', 'The model plans the drag again from the new image.',
          '{"ok":false,"code":"gui_frame_stale",\n "hint":"{\\"actions\\":[{\\"type\\":\\"screenshot\\"}]}",\n "input_emitted":false,"completed":0,"requested":2,\n "screen":{"width":1366,"height":768,...}}\n# fresh screenshot'],
      },
    };
    const state = { entry: 'mcp', tool: 'ax', kase: 'ok' };
    let timers = [];

    function steps() {
      const ok = state.kase === 'ok';
      const e = ENTRY[state.entry];
      const c = CASES[state.tool];
      const engine = state.tool;
      const viaDaemon = state.entry !== 'mcp';
      const providers = [engine, 'linux', 'macos', 'windows', 'desktop'];
      const [gDesc, gCode] = ok ? c.guardOk : c.guardBlock;
      const [rTitle, rDesc, rCode] = ok ? c.resultOk : c.resultErr;
      return [
        { tier: 'Entry', title: e.name, desc: e.desc, code: e[state.tool], status: 'pass',
          nodes: [`caller-${state.entry}`, state.entry, ...(viaDaemon ? ['daemon'] : [])] },
        { tier: 'Core', title: 'Check the call', status: 'pass', nodes: ['contract'],
          desc: 'HCU validates the whole batch before any input.', code: c.check },
        { tier: 'Core', title: 'Guard the target', status: ok ? 'pass' : 'block', nodes: ['state', 'guards'], desc: gDesc, code: gCode },
        ok
          ? { tier: 'Provider', title: 'Run the native input', status: 'pass', nodes: providers,
            desc: 'Same core, one native API per OS.', code: NATIVE[state.tool] }
          : { tier: 'Provider', title: 'Skipped', status: 'skip', nodes: providers,
            desc: 'No click, drag, or key press reaches the desktop.', code: '# no input sent' },
        { tier: 'Result', title: rTitle, status: ok ? 'pass' : 'error', nodes: [engine, state.entry], desc: rDesc, code: rCode },
      ];
    }

    const map = $('#arch-map');
    const mapNodes = map ? $$('[data-node]', map) : [];
    function paintMap(all) {
      const ok = state.kase === 'ok';
      const path = new Set();
      const skipped = new Set();
      all.forEach((st) => st.nodes.forEach((n) => (st.status === 'skip' ? skipped : path).add(n)));
      for (const el of mapNodes) {
        const n = el.dataset.node;
        el.classList.toggle('is-path', path.has(n) && !skipped.has(n));
        el.classList.toggle('is-skip', skipped.has(n));
        el.classList.toggle('is-block', !ok && n === 'guards');
      }
    }
    function focusNodes(names) {
      for (const el of mapNodes) el.classList.toggle('is-focus', !!names && names.includes(el.dataset.node));
    }

    const MARK = { pass: '', block: '×', skip: '', error: '!' };
    function render() {
      timers.forEach(clearTimeout);
      timers = [];
      $('#trace-task').textContent = tr(TASK[state.tool]);
      const all = steps();
      // Entry and Result are what the caller sends and gets back; the steps
      // between them run inside HCU and share one dashed frame.
      const inner = all.map((st) => st.tier === 'Core' || st.tier === 'Provider');
      list.innerHTML = all.map((st, i) => {
        const cls = !inner[i] ? '' : ` is-internal${inner[i - 1] ? '' : ' is-first'}${inner[i + 1] ? '' : ' is-last'}`;
        return `
        <li class="trace-step is-${st.status}${cls}" title="${esc(tr(st.desc))}">
          ${cls.includes('is-first') ? `<span class="trace-scope">${tr('Inside HCU')}</span>` : ''}
          <span class="trace-mark" aria-hidden="true">${MARK[st.status]}</span>
          <div class="trace-body">
            <div class="trace-text"><span class="trace-tier">${esc(tr(st.tier))}</span><h4>${esc(tr(st.title))}</h4><span class="trace-desc">${esc(tr(st.desc))}</span></div>
            <pre class="code"></pre>
          </div>
        </li>`;
      }).join('');
      const items = $$('.trace-step', list);
      items.forEach((li, i) => {
        // Keep compact one-line JSON here; the panel is narrow.
        $('pre', li).innerHTML = highlight(all[i].code);
        li.addEventListener('mouseenter', () => focusNodes(all[i].nodes));
        li.addEventListener('mouseleave', () => focusNodes(null));
        if (reduceMotion) li.classList.add('is-lit');
        else timers.push(setTimeout(() => li.classList.add('is-lit'), 80 * i));
      });
      paintMap(all);
    }

    for (const [attr, key] of [['traceEntry', 'entry'], ['traceTool', 'tool'], ['traceCase', 'kase']]) {
      const sel = `[data-${attr.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}]`;
      const buttons = $$(sel);
      buttons.forEach((btn) => btn.addEventListener('click', () => {
        buttons.forEach((other) => other.setAttribute('aria-pressed', String(other === btn)));
        state[key] = btn.dataset[attr];
        render();
      }));
    }
    render();
  })();

  /* ---------- BibTeX ---------- */
  const copyBtn = $('#copy-bibtex');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const label = $('span', copyBtn);
      try {
        await navigator.clipboard.writeText($('#bibtex-code').textContent);
        label.textContent = tr('Copied');
      } catch {
        label.textContent = tr('Select and copy');
      }
      setTimeout(() => { label.textContent = tr('Copy'); }, 1600);
    });
  }

  /* ---------- Fig. 1: the agent works through the three channels in turn ----------
     The motion layer holds only the moving parts and sits on a base image without
     them, so each frame repaints the small layer, not the 233-path figure. */
  (function fig1() {
    const box = $('.fig1');
    const img = box && $('img', box);
    if (!img || !img.dataset.motionBase || reduceMotion || !('IntersectionObserver' in window)) return;
    // The static figure is the first paint; the motion layer loads once the page is idle.
    const upgrade = () => {
      const base = new Image();
      base.src = img.dataset.motionBase;
      Promise.all([
        fetch('static/imgs/hcu-channels-motion.svg').then((r) => (r.ok ? r.text() : Promise.reject(new Error(r.status)))),
        base.decode(),
      ]).then(([svg]) => requestAnimationFrame(() => {
        // Swap in the same frame, so the parts never show twice or not at all.
        box.insertAdjacentHTML('beforeend', svg);
        img.src = base.src;
        run($('.fig1-motion', box));
      })).catch((err) => console.warn('Fig. 1 motion unavailable; the static figure stays.', err));
    };
    const idle = () => (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(upgrade, { timeout: 1500 });
    if (document.readyState === 'complete') idle(); else window.addEventListener('load', idle, { once: true });

    function run(root) {
      const PHASES = ['ax', 'gui', 'code'];
      const STEP = 3400;
      let at = 0;
      let timer = 0;
      let pinned = null;
      let inView = false;
      let running = false;
      const show = (phase) => {
        root.classList.remove('is-ax', 'is-gui', 'is-code');
        root.getBoundingClientRect(); // restart the phase's animations when it repeats
        root.classList.add(`is-${phase}`);
      };
      const tick = () => {
        show(pinned || PHASES[at]);
        if (!pinned) at = (at + 1) % PHASES.length;
        timer = setTimeout(tick, STEP);
      };
      const update = () => {
        const on = inView && !document.hidden;
        if (on === running) return;
        running = on;
        clearTimeout(timer);
        root.classList.toggle('is-paused', !on);
        if (on) { root.classList.add('is-run'); tick(); }
      };
      // Hovering a channel keeps the agent on it; leaving resumes the cycle after it.
      $$('.m-bar', root).forEach((bar) => {
        const hit = $('.m-hit', bar);
        hit.addEventListener('pointerenter', () => {
          pinned = bar.dataset.ch;
          if (running) { clearTimeout(timer); tick(); }
        });
        hit.addEventListener('pointerleave', () => {
          if (!pinned) return;
          at = (PHASES.indexOf(pinned) + 1) % PHASES.length;
          pinned = null;
          if (running) { clearTimeout(timer); timer = setTimeout(tick, STEP / 2); }
        });
      });
      new IntersectionObserver((entries) => { inView = entries[0].isIntersecting; update(); }, { threshold: 0.25 }).observe(root);
      document.addEventListener('visibilitychange', update);
    }
  })();

  /* ---------- Motivation sketches: one short loop per card ----------
     Each element names the step at which it appears (data-at), is used (data-hit),
     or is dropped (data-off); CSS animates the class changes. */
  (function sketches() {
    const boxes = $$('.why-vis');
    if (!boxes.length || reduceMotion || !('IntersectionObserver' in window)) return;
    const STEPS = 11; // six steps of action, then a pause before the loop restarts
    const TICK = 450;
    const MARKS = [['at', 'on'], ['hit', 'hit'], ['off', 'off']];
    const items = boxes.map((box) => {
      box.classList.add('anim');
      return { box, els: $$('[data-at], [data-hit], [data-off]', box), step: 0, timer: 0, inView: false };
    });
    const paint = (it) => it.els.forEach((el) => MARKS.forEach(([key, cls]) => {
      if (el.dataset[key] !== undefined) el.classList.toggle(cls, it.step >= Number(el.dataset[key]));
    }));
    const sync = (it) => {
      const on = it.inView && !document.hidden;
      if (on && !it.timer) {
        it.timer = setInterval(() => { it.step = (it.step + 1) % STEPS; paint(it); }, TICK);
      } else if (!on && it.timer) {
        clearInterval(it.timer);
        it.timer = 0;
      }
    };
    const io = new IntersectionObserver((entries) => entries.forEach((e) => {
      const it = items.find((x) => x.box === e.target);
      it.inView = e.isIntersecting;
      sync(it);
    }), { threshold: 0.5 });
    items.forEach((it) => { paint(it); io.observe(it.box); });
    document.addEventListener('visibilitychange', () => items.forEach(sync));
  })();

  /* ---------- One-shot sequences: the recorded guard run and the turn bars ---------- */
  (function oneShots() {
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    const once = (el, threshold, play) => {
      const io = new IntersectionObserver((entries) => {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        play();
      }, { threshold });
      io.observe(el);
    };

    // Grow the cost bars once when the row comes into view.
    $$('.turns-bar').forEach((bar) => {
      bar.classList.add('is-pending');
      once(bar, 0.6, () => bar.classList.remove('is-pending'));
    });
  })();

  /* ---------- Layout guard demo: four steps that loop while the card is on screen ---------- */
  (function guardDemo() {
    const demo = $('#guard-demo');
    if (!demo) return;
    const buttons = $$('.gd-steps button', demo);
    // Steps 2 and 4 show their result about 1.4 s in, after the 0.7 s layout move.
    const STEP_MS = [1600, 2200, 2000, 2400];
    let timer = 0;
    let visible = false;
    const go = (n) => {
      demo.dataset.step = String(n);
      buttons.forEach((b) => (Number(b.dataset.step) === n ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
      demo.style.setProperty('--gd-dur', `${STEP_MS[n - 1]}ms`);
      // Steps 1 and 3 return a screenshot, so the window flashes.
      demo.classList.remove('is-shot');
      demo.getBoundingClientRect(); // restart the flash and the step progress
      if (n === 1 || n === 3) demo.classList.add('is-shot');
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = 0;
      if (!visible || reduceMotion) return;
      demo.classList.add('is-auto');
      timer = setTimeout(() => { go((Number(demo.dataset.step) % 4) + 1); schedule(); }, STEP_MS[Number(demo.dataset.step) - 1]);
    };
    buttons.forEach((b) => b.addEventListener('click', () => { go(Number(b.dataset.step)); schedule(); }));
    go(1);
    if (reduceMotion || !('IntersectionObserver' in window)) return;
    new IntersectionObserver((entries) => {
      const now = entries[0].isIntersecting;
      if (now === visible) return;
      visible = now;
      if (visible) { go(1); schedule(); } else { clearTimeout(timer); timer = 0; demo.classList.remove('is-auto'); }
    }, { threshold: 0.3 }).observe(demo);
  })();

  /* ---------- Outlook cost row: 14 or 140 claims on one 500-turn scale ---------- */
  (function costRow() {
    const row = $('.evo-cost');
    if (!row) return;
    const SCALE = 500;
    const show = (claims, animate) => {
      const key = claims === '140' ? 'b' : 'a';
      row.dataset.claims = claims;
      $$('.seg button', row).forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.claims === claims)));
      $$('.turns-bar', row).forEach((bar) => bar.style.setProperty('--w', `${(Number(bar.dataset[key]) / SCALE) * 100}%`));
      $$('b[data-a]', row).forEach((b) => {
        const next = b.dataset[key];
        if (b.textContent === next) return;
        b.textContent = next;
        if (!animate || reduceMotion) return;
        b.classList.remove('is-bump');
        b.getBoundingClientRect(); // restart the bump on repeated clicks
        b.classList.add('is-bump');
      });
    };
    $$('.seg button', row).forEach((b) => b.addEventListener('click', () => show(b.dataset.claims, true)));
    show('14', false);
  })();
})();
