/* Lecer · small progressive enhancements. Everything important works without this file. */
(() => {
  'use strict';

  document.documentElement.classList.add('js');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const live = $('#live');

  const announce = (message) => {
    if (!live) return;
    live.textContent = '';
    window.setTimeout(() => { live.textContent = message; }, 30);
  };

  // each feature runs on its own, so one failure can't take the rest down
  const run = (feature) => {
    try { feature(); } catch (err) { console.error(err); }
  };

  /* ---------- reveal sections as they scroll in ---------- */
  function reveal() {
    const items = $$('.reveal');
    if (!('IntersectionObserver' in window)) {
      items.forEach((el) => el.classList.add('is-visible'));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- highlight the current section in the nav ---------- */
  function navState() {
    const nav = $('.nav-links');
    const links = $$('a[href^="#"]', nav || document.createElement('div'));
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map((a) => [a.hash.slice(1), a]));

    const setCurrent = (id) => {
      for (const a of links) a.removeAttribute('aria-current');
      const link = byId.get(id);
      if (!link) return;
      link.setAttribute('aria-current', 'true');
      // keep the active pill in view on narrow screens
      const r = link.getBoundingClientRect();
      const box = nav.getBoundingClientRect();
      if (r.left < box.left || r.right > box.right) nav.scrollBy({ left: r.left - box.left - 12, behavior: 'smooth' });
    };

    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setCurrent(entry.target.id);
    }, { rootMargin: '-40% 0px -55% 0px' });
    $$('main > section[id]').forEach((section) => io.observe(section));
  }

  /* ---------- copy buttons (Discord name, install commands) ---------- */
  function copyButtons() {
    const originals = new WeakMap();

    const legacyCopy = (text) => {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
      return ok;
    };

    document.addEventListener('click', async (event) => {
      const btn = event.target.closest('[data-copy]');
      if (!btn) return;
      const text = btn.dataset.copy;

      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        ok = legacyCopy(text);
      }
      if (!ok) {
        announce('Copying failed. Select the text and copy it manually.');
        return;
      }

      const icon = btn.querySelector('use[href="#i-copy"]') || (btn.classList.contains('icon-btn') ? btn.querySelector('use') : null);
      const label = btn.querySelector('.copy-label');
      if (!originals.has(btn)) {
        originals.set(btn, { href: icon?.getAttribute('href'), label: label?.textContent, tip: btn.dataset.tip });
      }
      const saved = originals.get(btn);

      btn.classList.add('is-copied');
      icon?.setAttribute('href', '#i-check');
      if (label) label.textContent = 'Copied';
      if (saved.tip !== undefined) btn.dataset.tip = 'Copied!';
      announce(`Copied “${text}” to the clipboard`);

      window.clearTimeout(btn.copyTimer);
      btn.copyTimer = window.setTimeout(() => {
        btn.classList.remove('is-copied');
        if (icon && saved.href) icon.setAttribute('href', saved.href);
        if (label && saved.label) label.textContent = saved.label;
        if (saved.tip !== undefined) btn.dataset.tip = saved.tip;
      }, 1800);
    });
  }

  /* ---------- live star counts (the HTML already has a recent fallback) ---------- */
  async function githubStars() {
    const targets = $$('[data-stars]');
    if (!targets.length || !window.fetch) return;
    const KEY = 'lecer:gh-stars:v1';
    let stars = null;

    try {
      const cached = JSON.parse(window.sessionStorage.getItem(KEY) || 'null');
      if (cached && Date.now() - cached.t < 3600e3) stars = cached.d;
    } catch { /* storage can be blocked; that's fine */ }

    if (!stars) {
      try {
        const res = await fetch('https://api.github.com/users/Lecer69/repos?per_page=100', {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const repos = await res.json();
        stars = {};
        for (const repo of repos) stars[repo.name] = repo.stargazers_count;
        try { window.sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: stars })); } catch { /* ignore */ }
      } catch {
        return;
      }
    }

    for (const el of targets) {
      const count = stars[el.dataset.stars];
      if (Number.isFinite(count)) el.textContent = count.toLocaleString('en-US');
    }
  }

  /* ---------- osu! global rank, last 90 days ---------- */
  function rankChart() {
    const root = $('[data-rank-chart]');
    const source = $('#rank-data');
    if (!root || !source) return;

    const { end, ranks } = JSON.parse(source.textContent);
    const n = ranks.length;
    const endMs = Date.parse(`${end}T00:00:00Z`);
    const dates = ranks.map((_, i) => new Date(endMs - (n - 1 - i) * 864e5));
    const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const fullDate = (d) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
    const fmtRank = (v) => `#${v.toLocaleString('en-US')}`;

    const plot = $('.chart-plot', root);
    const tip = $('.chart-tip', root);
    const tipValue = $('.chart-tip-value', root);
    const tipDate = $('.chart-tip-date', root);

    const NS = 'http://www.w3.org/2000/svg';
    const LO = 20400;               // best rank shown (top of the plot)
    const HI = 31800;               // worst rank shown (bottom)
    const TICKS = [22000, 26000, 30000];
    const M = { t: 10, r: 10, b: 24, l: 42 };

    let W = 0;
    let H = 0;
    let svg = null;
    let cross = null;
    let idx = -1;
    let xAt = () => 0;
    let yAt = () => 0;

    const node = (tag, attrs, parent) => {
      const el = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
      if (parent) parent.appendChild(el);
      return el;
    };
    const label = (parent, attrs, content) => {
      node('text', { class: 'chart-tick', ...attrs }, parent).textContent = content;
    };

    function show(i) {
      if (!cross) return;
      idx = Math.max(0, Math.min(n - 1, i));
      const x = xAt(idx);
      const y = yAt(ranks[idx]);
      cross.setAttribute('visibility', 'visible');
      cross.setAttribute('transform', `translate(${x.toFixed(1)} 0)`);
      for (const c of cross.querySelectorAll('circle')) c.setAttribute('cy', y.toFixed(1));

      tipValue.textContent = fmtRank(ranks[idx]);
      tipDate.textContent = fullDate(dates[idx]);
      tip.hidden = false;
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      const left = Math.max(0, Math.min(W - tw, x - tw / 2));
      const top = y - th - 12 < 0 ? y + 14 : y - th - 12;
      tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    }

    function hide() {
      idx = -1;
      cross?.setAttribute('visibility', 'hidden');
      tip.hidden = true;
    }

    function draw() {
      W = Math.round(plot.clientWidth);
      H = Math.round(plot.clientHeight);
      if (!W || !H) return;
      const iw = W - M.l - M.r;
      const ih = H - M.t - M.b;
      const base = M.t + ih;
      xAt = (i) => M.l + (i / (n - 1)) * iw;
      yAt = (v) => M.t + ((v - LO) / (HI - LO)) * ih; // rank is inverted: better sits higher

      svg?.remove();
      svg = node('svg', { class: 'chart-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });

      const grid = node('g', { class: 'chart-grid' }, svg);
      for (const t of TICKS) {
        const y = Math.round(yAt(t)) + 0.5;
        node('line', { x1: M.l, x2: W - M.r, y1: y, y2: y }, grid);
        label(grid, { x: M.l - 8, y: y + 4, 'text-anchor': 'end' }, `#${t / 1000}K`);
      }
      label(svg, { x: M.l, y: H - 6 }, shortDate(dates[0]));
      label(svg, { x: W - M.r, y: H - 6, 'text-anchor': 'end' }, shortDate(dates[n - 1]));

      const line = `M${ranks.map((v, i) => `${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join('L')}`;
      node('path', { class: 'chart-area', d: `${line}L${xAt(n - 1).toFixed(1)} ${base}L${M.l} ${base}Z` }, svg);
      node('path', { class: 'chart-line', d: line }, svg);

      const ex = xAt(n - 1);
      const ey = yAt(ranks[n - 1]);
      node('circle', { class: 'chart-ring', cx: ex, cy: ey, r: 6 }, svg);
      node('circle', { class: 'chart-dot', cx: ex, cy: ey, r: 4 }, svg);

      cross = node('g', { class: 'chart-cross', visibility: 'hidden' }, svg);
      node('line', { x1: 0, x2: 0, y1: M.t, y2: base }, cross);
      node('circle', { class: 'chart-ring', r: 6 }, cross);
      node('circle', { class: 'chart-dot', r: 4 }, cross);

      plot.insertBefore(svg, tip);
      if (idx >= 0) show(idx);
    }

    const fromPointer = (event) => {
      const box = plot.getBoundingClientRect();
      const ratio = (event.clientX - box.left - M.l) / (W - M.l - M.r);
      show(Math.round(ratio * (n - 1)));
    };
    plot.addEventListener('pointermove', fromPointer);
    plot.addEventListener('pointerdown', fromPointer);
    plot.addEventListener('pointerleave', () => { if (!plot.matches(':focus-visible')) hide(); });
    plot.addEventListener('focus', () => show(idx >= 0 ? idx : n - 1));
    plot.addEventListener('blur', hide);
    plot.addEventListener('keydown', (event) => {
      const steps = { ArrowLeft: -1, ArrowRight: 1, ArrowDown: -1, ArrowUp: 1, PageDown: -7, PageUp: 7 };
      let next = null;
      if (event.key in steps) next = (idx < 0 ? n - 1 : idx) + steps[event.key];
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = n - 1;
      else if (event.key === 'Escape') { hide(); return; }
      if (next === null) return;
      event.preventDefault();
      show(next);
      announce(`${tipValue.textContent}, ${tipDate.textContent}`);
    });

    if ('ResizeObserver' in window) {
      new ResizeObserver(draw).observe(plot);
    } else {
      window.addEventListener('resize', draw);
      draw();
    }

    // the same numbers as a table, newest first
    const tbody = $('.chart-table tbody', root);
    if (tbody) {
      const rows = document.createDocumentFragment();
      for (let i = n - 1; i >= 0; i--) {
        const tr = document.createElement('tr');
        const day = document.createElement('td');
        const value = document.createElement('td');
        day.textContent = fullDate(dates[i]);
        value.textContent = fmtRank(ranks[i]);
        tr.append(day, value);
        rows.appendChild(tr);
      }
      tbody.appendChild(rows);
    }
  }

  /* ---------- hover / focus readout on the artist bars ---------- */
  function barTips() {
    const figure = $('[data-bars]');
    const tip = figure && $('.bar-tip', figure);
    if (!tip) return;

    const show = (row) => {
      const bar = $('.bar', row);
      tip.textContent = row.dataset.tip;
      tip.hidden = false;
      const f = figure.getBoundingClientRect();
      const b = bar.getBoundingClientRect();
      const x = Math.max(8, Math.min(b.right - f.left + 40, f.width - tip.offsetWidth - 8));
      const y = b.top - f.top + b.height / 2 - tip.offsetHeight / 2;
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    };
    const hide = () => { tip.hidden = true; };

    for (const row of $$('.bar-row', figure)) {
      row.addEventListener('pointerenter', () => show(row));
      row.addEventListener('pointerleave', hide);
      row.addEventListener('focus', () => show(row));
      row.addEventListener('blur', hide);
    }
  }

  /* ---------- screenshot lightbox ---------- */
  function lightbox() {
    const dialog = $('#lightbox');
    if (!dialog || typeof dialog.showModal !== 'function') return;
    const caption = $('.lightbox-cap', dialog);
    const img = document.createElement('img');
    img.alt = '';
    dialog.insertBefore(img, caption);

    document.addEventListener('click', (event) => {
      const link = event.target.closest('a[data-lightbox]');
      if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const thumb = $('img', link);
      img.src = link.href;
      img.alt = thumb ? thumb.alt : '';
      caption.textContent = img.alt;
      dialog.showModal();
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog || event.target.closest('[data-close]')) dialog.close();
    });
    dialog.addEventListener('close', () => img.removeAttribute('src'));
  }

  /* ---------- Spotify: only load the player (and its cookies) on request ---------- */
  function spotify() {
    const card = $('[data-spotify]');
    const trigger = card && $('[data-spotify-load]', card);
    if (!trigger) return;
    trigger.addEventListener('click', (event) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const frame = document.createElement('iframe');
      frame.className = 'spotify-frame';
      frame.src = card.dataset.spotify;
      frame.title = 'osu!metal playlist on Spotify';
      frame.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      card.classList.add('is-loaded');
      card.replaceChildren(frame);
      window.requestAnimationFrame(() => frame.focus());
    });
  }

  /* ---------- falling sakura petals (Perfect Cherry Blossom, but calmer) ---------- */
  function petals() {
    const canvas = $('#petals');
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;

    const colors = ['#ffd6e5', '#f9bcd2', '#f5a3c0', '#fbe3ec', '#eb92b8', '#e7c9f5'];
    const rand = (a, b) => a + Math.random() * (b - a);
    let w = 0;
    let h = 0;
    let list = [];
    let raf = 0;
    let last = 0;
    let running = false;

    const make = (x, y, burst) => {
      const s = rand(7, 15);
      const fall = rand(0.35, 0.8) + s * 0.02;
      const wind = rand(-0.05, 0.35);
      const angle = rand(0, Math.PI * 2);
      const speed = rand(1.5, 5);
      return {
        x, y, s, fall, wind,
        vx: burst ? Math.cos(angle) * speed : wind,
        vy: burst ? Math.sin(angle) * speed - 1.5 : fall,
        r: rand(0, Math.PI * 2), vr: rand(-0.02, 0.02),
        f: rand(0, Math.PI * 2), vf: rand(0.012, 0.035),
        sw: rand(0, Math.PI * 2), vsw: rand(0.006, 0.014),
        a: rand(0.35, 0.75),
        c: colors[Math.floor(Math.random() * colors.length)],
        temp: Boolean(burst),
      };
    };
    const fresh = (anywhere) => make(rand(-20, w + 20), anywhere ? rand(-20, h) : rand(-60, -20), false);

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const want = Math.round(Math.min(26, Math.max(8, (w * h) / 70000)));
      const base = list.filter((p) => !p.temp);
      while (base.length < want) base.push(fresh(true));
      base.length = want;
      list = base.concat(list.filter((p) => p.temp));
    };

    const drawPetal = (p) => {
      const s = p.s;
      const hw = s * 0.52;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.r);
      ctx.scale(Math.cos(p.f), 1); // the tumble
      ctx.globalAlpha = p.a;
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.5);
      ctx.bezierCurveTo(-hw, s * 0.25, -hw * 0.95, -s * 0.35, -hw * 0.25, -s * 0.5);
      ctx.lineTo(0, -s * 0.36); // the little notch every sakura petal has
      ctx.lineTo(hw * 0.25, -s * 0.5);
      ctx.bezierCurveTo(hw * 0.95, -s * 0.35, hw, s * 0.25, 0, s * 0.5);
      ctx.fill();
      ctx.restore();
    };

    const frame = (t) => {
      const dt = last ? Math.min(3, (t - last) / 16.667) : 1;
      last = t;
      ctx.clearRect(0, 0, w, h);
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        p.vx += (p.wind - p.vx) * 0.012 * dt;
        p.vy += (p.fall - p.vy) * 0.02 * dt;
        p.sw += p.vsw * dt;
        p.f += p.vf * dt;
        p.r += p.vr * dt;
        p.x += (p.vx + Math.sin(p.sw) * 0.45) * dt;
        p.y += p.vy * dt;
        if (p.y > h + 30 || p.x < -60 || p.x > w + 60) {
          if (p.temp) list.splice(i, 1);
          else list[i] = fresh(false);
          continue;
        }
        drawPetal(p);
      }
      raf = window.requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || document.hidden || reduceMotion.matches) return;
      running = true;
      last = 0;
      raf = window.requestAnimationFrame(frame);
    };
    const stop = () => {
      running = false;
      window.cancelAnimationFrame(raf);
    };

    resize();
    window.addEventListener('resize', resize, { passive: true });
    document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
    reduceMotion.addEventListener?.('change', () => {
      if (reduceMotion.matches) {
        stop();
        ctx.clearRect(0, 0, w, h);
      } else {
        start();
      }
    });
    start();

    // a gust of petals: tap the avatar, or type "yuyuko" anywhere
    const burst = (x, y, count) => {
      if (reduceMotion.matches) return;
      for (let i = 0; i < count; i++) list.push(make(x, y, true));
      start();
    };
    $('.avatar')?.addEventListener('click', (event) => burst(event.clientX, event.clientY, 36));
    let typed = '';
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      typed = (typed + event.key.toLowerCase()).slice(-6);
      if (typed === 'yuyuko') {
        typed = '';
        burst(w / 2, h / 3, 64);
      }
    });
  }

  run(reveal);
  run(navState);
  run(copyButtons);
  run(rankChart);
  run(barTips);
  run(lightbox);
  run(spotify);
  run(petals);
  githubStars();
})();
