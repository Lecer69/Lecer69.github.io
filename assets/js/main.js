/* Lecer · renders live GitHub and AUR data and data/site.json into the page, plus a few small enhancements. */
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
  const run = (feature, ...args) => {
    try { feature(...args); } catch (err) { console.error(err); }
  };

  /* ---------- building blocks ---------- */

  // h('a', { href, class }, 'text', child, [more]) → element; text is always set as text, never HTML
  const h = (tag, props = {}, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(props)) {
      if (value == null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'style') el.style.cssText = value;
      else if (key.startsWith('on')) el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value === true ? '' : value);
    }
    el.append(...children.flat(Infinity).filter((c) => c != null && c !== false));
    return el;
  };

  const icon = (id) => {
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('class', 'i');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS(NS, 'use');
    use.setAttribute('href', `#${id}`);
    svg.appendChild(use);
    return svg;
  };

  const external = { target: '_blank', rel: 'noopener' };
  const safeUrl = (url) => (typeof url === 'string' && /^https:\/\//i.test(url) ? url : null);
  const get = (obj, path) => path.split('.').reduce((o, key) => (o == null ? undefined : o[key]), obj);

  /* ---------- formatting ---------- */

  const nf = new Intl.NumberFormat('en-US');
  const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  const regions = 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

  const timeAgo = (date) => {
    const seconds = (Date.parse(date) - Date.now()) / 1000;
    const units = [['year', 31536e3], ['month', 2592e3], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
    }
    return 'just now';
  };
  const fullDate = (date) => new Date(date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const FORMAT = {
    int: (v) => nf.format(Math.round(v)),
    rank: (v) => `#${nf.format(v)}`,
    pp: (v) => `${nf.format(Math.round(v))}pp`,
    pct: (v) => `${v.toFixed(2)}%`,
    hours: (v) => `${nf.format(Math.round(v / 3600))}h`,
    combo: (v) => `${nf.format(v)}x`,
    length: (v) => nf.format(v.length),
    list: (v) => v.join(', '),
    date: fullDate,
    monthYear: (v) => new Date(v).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }),
    ago: timeAgo,
    country: (code) => regions?.of(code) ?? code,
  };

  // osu! serves twemoji flags named by the two regional-indicator code points
  const flagUrl = (code) => `https://osu.ppy.sh/assets/images/flags/${[...code.toUpperCase()].map((c) => (0x1f1a5 + c.charCodeAt(0)).toString(16)).join('-')}.svg`;

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
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
    items.forEach((el) => io.observe(el));
  }

  /* ---------- highlight the current section in the nav ---------- */
  function navState() {
    const nav = $('.nav-links');
    const links = nav ? $$('a[href^="#"]', nav) : [];
    if (!links.length || !('IntersectionObserver' in window)) return;
    const byId = new Map(links.map((a) => [a.hash.slice(1), a]));

    const setCurrent = (id) => {
      for (const a of links) a.removeAttribute('aria-current');
      const link = byId.get(id);
      if (!link) return;
      link.setAttribute('aria-current', 'true');
      // keep the active link in view when the nav scrolls sideways on phones
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

      const use = btn.querySelector('use[href="#i-copy"]') || (btn.classList.contains('icon-btn') ? btn.querySelector('use') : null);
      const label = btn.querySelector('.copy-label');
      if (!originals.has(btn)) originals.set(btn, { href: use?.getAttribute('href'), label: label?.textContent, tip: btn.dataset.tip });
      const saved = originals.get(btn);

      btn.classList.add('is-copied');
      use?.setAttribute('href', '#i-check');
      if (label) label.textContent = 'Copied';
      if (saved.tip !== undefined) btn.dataset.tip = 'Copied!';
      announce(`Copied “${text}” to the clipboard`);

      window.clearTimeout(btn.copyTimer);
      btn.copyTimer = window.setTimeout(() => {
        btn.classList.remove('is-copied');
        if (use && saved.href) use.setAttribute('href', saved.href);
        if (label && saved.label) label.textContent = saved.label;
        if (saved.tip !== undefined) btn.dataset.tip = saved.tip;
      }, 1800);
    });
  }

  const copyButton = (text) => h('button', { class: 'copy-btn', type: 'button', 'data-copy': text, 'aria-label': `Copy: ${text}` }, icon('i-copy'), h('span', { class: 'copy-label' }, 'Copy'));
  const installLine = (cmd) => h('div', { class: 'install-inline' }, h('code', {}, cmd), copyButton(cmd));

  /* ---------- simple bindings: data-bind, data-src, data-href, data-requires ---------- */
  // safe to run again whenever the data changes; `pending` names live sources that haven't answered yet
  function bind(data, pending = new Set()) {
    // what each "couldn't be loaded" note (data-missing) is about
    const notes = { osu: data.osu, repos: data.github?.repos };
    const missing = Object.keys(notes).filter((key) => notes[key] == null && !pending.has(key));
    document.documentElement.dataset.missing = missing.join(' ');

    for (const el of $$('[data-requires]')) {
      const value = get(data, el.dataset.requires);
      // toggleAttribute rather than .hidden, which SVG elements don't have
      el.toggleAttribute('hidden', value == null || value === false || (Array.isArray(value) && !value.length));
    }
    for (const el of $$('[data-bind]')) {
      const [path, format] = el.dataset.bind.split('|');
      const value = get(data, path);
      if (value == null) continue;
      el.textContent = FORMAT[format] ? FORMAT[format](value) : value;
      if (el.matches('time')) el.dateTime = value;
    }
    for (const el of $$('[data-src]')) {
      const url = safeUrl(get(data, el.dataset.src));
      if (url) el.src = url;
    }
    for (const el of $$('[data-href]')) {
      const url = safeUrl(get(data, el.dataset.href));
      if (url) el.href = url;
    }
    for (const el of $$('[data-flag]')) {
      const code = get(data, el.dataset.flag);
      if (typeof code === 'string' && /^[a-z]{2}$/i.test(code)) {
        el.src = flagUrl(code);
        el.alt = '';
      }
    }
    for (const el of $$('[data-meter]')) {
      const value = Number(get(data, el.dataset.meter));
      if (!Number.isFinite(value)) continue;
      el.style.setProperty('--v', `${value}%`);
      el.setAttribute('aria-valuenow', value);
    }
  }

  /* ---------- Dumble Land: live numbers when the workflow has repo access ---------- */
  function renderDumble(data) {
    if (!data.dumble) return;
    for (const row of $$('[data-plugin]')) {
      const stats = data.dumble[row.dataset.plugin];
      if (!stats) continue;
      row.append(h('p', { class: 'plugin-stats' },
        h('span', {}, h('b', {}, nf.format(stats.commits)), ' commits'),
        h('span', {}, h('b', {}, compact.format(stats.lines)), ' lines'),
        h('span', {}, 'since ', h('b', {}, String(stats.since))),
      ));
    }
  }

  /* ---------- open source ---------- */
  const LANG_COLORS = {
    Rust: '#dea584', QML: '#44a51c', Java: '#b07219', Kotlin: '#a97bff', JavaScript: '#f1e05a', TypeScript: '#3178c6',
    Python: '#3572a5', Shell: '#89e051', Go: '#00add8', 'C++': '#f34b7d', C: '#8a8a8a', Lua: '#5a6bd6', HTML: '#e34c26', CSS: '#663399',
  };

  function renderRepos(data) {
    const list = $('[data-render="repos"]');
    const repos = data.github?.repos;
    if (!list || !repos) return;
    const packages = new Map((data.aur ?? []).map((p) => [String(p.upstream).toLowerCase().replace(/\/+$/, ''), p]));

    list.replaceChildren(...repos.map((repo) => {
      const pkg = packages.get(repo.url.toLowerCase());
      return h('li', { class: 'repo' },
        h('h3', { class: 'repo-name' },
          h('a', { href: safeUrl(repo.url), ...external }, repo.name),
          repo.version && h('a', { class: 'repo-version', href: safeUrl(repo.version.url), ...external, title: 'Latest version' }, repo.version.tag)),
        repo.description && h('p', { class: 'repo-desc' }, repo.description),
        repo.topics.length > 0 && h('ul', { class: 'repo-topics', 'aria-label': 'Topics' }, repo.topics.map((t) => h('li', {}, t))),
        h('p', { class: 'repo-meta' },
          repo.language && h('span', {}, h('i', { class: 'lang-dot', style: `--c:${LANG_COLORS[repo.language] ?? 'var(--text-3)'}` }), repo.language),
          h('span', { title: `${repo.stars} stars` }, icon('i-star'), nf.format(repo.stars)),
          pkg && h('span', {}, h('a', { href: safeUrl(pkg.url), ...external }, 'on the AUR')),
          h('span', {}, `updated ${timeAgo(repo.pushedAt)}`)),
      );
    }));
    list.removeAttribute('aria-busy');
  }

  function renderAur(data) {
    const list = $('[data-render="aur"]');
    if (!list || !data.aur) return;
    list.replaceChildren(...data.aur.map((p) => h('li', { class: 'aur-item' },
      h('p', { class: 'aur-line' },
        h('span', {}, h('span', { class: 'aur-repo' }, 'aur/'), h('a', { class: 'aur-name', href: safeUrl(p.url), ...external }, p.name)),
        h('span', { class: 'aur-version' }, p.version),
        h('span', { class: 'aur-votes', title: `${p.votes} votes, popularity ${p.popularity.toFixed(2)}` }, `(+${p.votes} ${p.popularity.toFixed(2)})`),
        p.outOfDate && h('span', { class: 'aur-flag' }, '(Out-of-date)')),
      p.description && h('p', { class: 'aur-desc' }, p.description),
      h('div', { class: 'aur-install' }, installLine(`yay -S ${p.name}`)),
    )));
    list.removeAttribute('aria-busy');
  }

  function renderSkills(data) {
    const list = $('[data-render="skills"]');
    const skills = data.github?.skills ?? [];
    if (!list || !skills.length) return;
    list.replaceChildren(...skills.map((s) => h('li', {}, s)));
  }

  /* ---------- GitHub contributions, last year ---------- */
  function renderCalendar(data) {
    const root = $('[data-render="calendar"]');
    const cal = data.github?.contributions?.calendar;
    if (!root || !cal) return;
    const grid = $('.contrib-grid', root);
    const scroller = $('.contrib-scroll', root);
    const tip = $('.chart-tip', root);

    const start = Date.parse(`${cal.start}T00:00:00Z`);
    const offset = new Date(start).getUTCDay(); // rows run Sunday to Saturday, like GitHub's
    const dayAt = (i) => new Date(start + i * 864e5);
    const cells = [];

    ['Mon', 'Wed', 'Fri'].forEach((name, k) => cells.push(h('span', { class: 'wd', style: `grid-column:1;grid-row:${k * 2 + 3}` }, name)));
    let lastLabel = -9;
    cal.counts.forEach((count, i) => {
      const date = dayAt(i);
      const week = Math.floor((i + offset) / 7);
      const row = ((i + offset) % 7) + 2;
      if (date.getUTCDate() <= 7 && row === 2 && week - lastLabel > 2) {
        cells.push(h('span', { class: 'month', style: `grid-column:${week + 2} / span 3` }, date.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })));
        lastLabel = week;
      }
      cells.push(h('i', { class: 'day', 'data-l': cal.levels[i], 'data-i': i, style: `grid-column:${week + 2};grid-row:${row}` }));
    });
    grid.style.gridTemplateColumns = '28px';
    grid.replaceChildren(...cells);

    const describe = (i) => {
      const n = cal.counts[i];
      return `${n ? nf.format(n) : 'No'} contribution${n === 1 ? '' : 's'} on ${fullDate(dayAt(i))}`;
    };
    // handler properties rather than listeners: the live data renders this a second time
    grid.onpointerover = (event) => {
      const day = event.target.closest('.day');
      if (!day) return;
      tip.textContent = describe(Number(day.dataset.i));
      tip.hidden = false;
      const box = scroller.getBoundingClientRect();
      const r = day.getBoundingClientRect();
      const x = Math.max(0, Math.min(scroller.scrollWidth - tip.offsetWidth, r.left - box.left + scroller.scrollLeft + r.width / 2 - tip.offsetWidth / 2));
      const above = r.top - box.top - tip.offsetHeight - 6;
      tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(above >= 0 ? above : r.bottom - box.top + 6)}px)`;
    };
    grid.onpointerleave = () => { tip.hidden = true; };

    // newest weeks first in view on narrow screens
    scroller.scrollLeft = scroller.scrollWidth;

    const months = new Map();
    cal.counts.forEach((count, i) => {
      const key = dayAt(i).toISOString().slice(0, 7);
      months.set(key, (months.get(key) ?? 0) + count);
    });
    $('tbody', root).replaceChildren(...[...months].reverse().map(([month, total]) => h('tr', {},
      h('td', {}, new Date(`${month}-01T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })),
      h('td', {}, nf.format(total)))));
  }

  /* ---------- dots-hyprland ---------- */
  // screenshots live in the repo as big PNGs; wsrv.nl resizes them to WebP on the fly
  const resized = (url, width) => `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=${width}&output=webp&q=82`;
  const fallBackTo = (url) => function onError() {
    if (this.dataset.fellBack) return;
    this.dataset.fellBack = '1';
    this.removeAttribute('srcset');
    this.src = url;
  };

  // the dots repo has one preview screenshot now; a single image fills the row, more fall back to big-plus-column
  function renderScreenshots(data) {
    const gallery = $('[data-render="screenshots"]');
    const shots = data.dots?.screenshots ?? [];
    if (!gallery || !shots.length) return;
    gallery.dataset.count = Math.min(shots.length, 3);
    gallery.replaceChildren(...shots.map((url, i) => h('a', { class: 'shot', href: resized(url, 1920), 'data-lightbox': true, 'data-original': url },
      h('img', {
        src: resized(url, i === 0 ? 1920 : 720),
        width: 1600, height: 900, loading: 'lazy', decoding: 'async',
        alt: shots.length > 1 ? `Screenshot ${i + 1} of my Hyprland desktop with lis` : 'My Hyprland desktop with lis',
        onerror: fallBackTo(url),
      }),
      shots.length > 1 ? h('span', { class: 'shot-num', 'aria-hidden': 'true' }, `${i + 1}/${shots.length}`) : null,
    )));
    gallery.removeAttribute('aria-busy');
  }

  // folder names in dots/quickshell/lis, named the way the dots README names them
  const MODULES = {
    audio: 'Audio', bar: 'Bar', battery: 'Battery & power', bluetooth: 'Bluetooth', brightness: 'Brightness',
    calendar: 'Calendar', cheatsheet: 'Keybind cheatsheet', desktop: 'Widget overlay', displays: 'Displays',
    gamma: 'Color settings', goals: 'Goals', hover: 'Hover bars', hypridle: 'Idle', internet: 'Internet usage',
    lock: 'Lock screen', media: 'Media player', network: 'Network', notes: 'Notes', notification: 'Notifications',
    osu: 'osu! mode', overview: 'Launcher', polkit: 'Polkit agent', screenshot: 'Screenshots', settings: 'Settings',
    taskmanager: 'Task manager', todo: 'To-do', volume: 'Volume', wellbeing: 'Wellbeing', workspaces: 'Workspace overview',
  };
  const NOT_MODULES = new Set(['icons', 'scripts', 'tools', 'assets', 'components', 'common']);

  function renderModules(data) {
    const list = $('[data-render="modules"]');
    const modules = (data.dots?.modules ?? []).filter((m) => !NOT_MODULES.has(m))
      .map((m) => MODULES[m] ?? m.charAt(0).toUpperCase() + m.slice(1))
      .sort((a, b) => a.localeCompare(b, 'en'));
    if (!list || !modules.length) return;
    list.replaceChildren(...modules.map((m) => h('li', {}, m)));
    const count = list.closest('div')?.querySelector('.sub-title .count');
    if (count) count.textContent = nf.format(modules.length);
  }

  /* ---------- osu! ---------- */
  const GRADE_LETTER = { XH: 'SS', X: 'SS', SH: 'S', S: 'S', A: 'A', B: 'B', C: 'C', D: 'D', F: 'F' };
  const gradeBadge = (grade) => h('span', { class: `grade grade-${grade}`, title: `Grade ${GRADE_LETTER[grade] ?? grade}${/H$/.test(grade) ? ' (silver)' : ''}` },
    h('span', { 'aria-hidden': 'true' }, GRADE_LETTER[grade] ?? grade),
    h('span', { class: 'sr-only' }, `Grade ${GRADE_LETTER[grade] ?? grade}${/H$/.test(grade) ? ', silver' : ''}`));

  function renderGrades(data) {
    const list = $('[data-render="grades"]');
    const counts = data.osu?.stats?.grades;
    if (!list || !counts) return;
    list.replaceChildren(...[['XH', 'ssh'], ['X', 'ss'], ['SH', 'sh'], ['S', 's'], ['A', 'a']].map(([grade, key]) => h('li', {}, gradeBadge(grade), h('span', {}, nf.format(counts[key] ?? 0)))));
  }

  /* ---------- osu! global rank, last 90 days ---------- */
  function rankChart(data) {
    const root = $('[data-rank-chart]');
    const history = data.osu?.rankHistory ?? [];
    if (!root || history.length < 2) {
      if (root) root.hidden = true;
      return;
    }

    // unranked days come back as 0; carry the last real rank through them
    const ranks = [];
    for (const r of history) ranks.push(r > 0 ? r : ranks[ranks.length - 1] ?? 0);
    const n = ranks.length;
    const endMs = Date.parse(data.generatedAt.slice(0, 10) + 'T00:00:00Z');
    const dates = ranks.map((_, i) => new Date(endMs - (n - 1 - i) * 864e5));
    const shortDate = (d) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const fmtRank = (v) => `#${nf.format(v)}`;

    // a domain with clean ticks around the data; better (smaller) ranks sit higher
    const lo = Math.min(...ranks);
    const hi = Math.max(...ranks);
    const spread = Math.max(hi - lo, 20);
    const rough = spread / 3;
    const pow = 10 ** Math.floor(Math.log10(rough));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough);
    const LO = Math.floor((lo - spread * 0.06) / step) * step;
    const HI = Math.ceil((hi + spread * 0.06) / step) * step;
    const TICKS = [];
    for (let t = LO + step; t < HI; t += step) TICKS.push(t);

    const plot = $('.chart-plot', root);
    const tip = $('.chart-tip', root);
    const tipValue = $('.chart-tip-value', root);
    const tipDate = $('.chart-tip-date', root);
    const NS = 'http://www.w3.org/2000/svg';
    const M = { t: 8, r: 8, b: 22, l: 46 };

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
      const left = Math.max(0, Math.min(W - tip.offsetWidth, x - tip.offsetWidth / 2));
      const top = y - tip.offsetHeight - 12 < 0 ? y + 14 : y - tip.offsetHeight - 12;
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
      yAt = (v) => M.t + ((v - LO) / (HI - LO)) * ih;

      svg?.remove();
      svg = node('svg', { class: 'chart-svg', width: W, height: H, viewBox: `0 0 ${W} ${H}`, 'aria-hidden': 'true', focusable: 'false' });
      const grid = node('g', { class: 'chart-grid' }, svg);
      for (const t of TICKS) {
        const y = Math.round(yAt(t)) + 0.5;
        node('line', { x1: M.l, x2: W - M.r, y1: y, y2: y }, grid);
        label(grid, { x: M.l - 8, y: y + 4, 'text-anchor': 'end' }, `#${compact.format(t)}`);
      }
      label(svg, { x: M.l, y: H - 4 }, shortDate(dates[0]));
      label(svg, { x: W - M.r, y: H - 4, 'text-anchor': 'end' }, 'today');

      const line = `M${ranks.map((v, i) => `${xAt(i).toFixed(1)} ${yAt(v).toFixed(1)}`).join('L')}`;
      node('path', { class: 'chart-area', d: `${line}L${xAt(n - 1).toFixed(1)} ${base}L${M.l} ${base}Z` }, svg);
      node('path', { class: 'chart-line', d: line }, svg);
      node('circle', { class: 'chart-ring', cx: xAt(n - 1), cy: yAt(ranks[n - 1]), r: 6 }, svg);
      node('circle', { class: 'chart-dot', cx: xAt(n - 1), cy: yAt(ranks[n - 1]), r: 4 }, svg);

      cross = node('g', { class: 'chart-cross', visibility: 'hidden' }, svg);
      node('line', { x1: 0, x2: 0, y1: M.t, y2: base }, cross);
      node('circle', { class: 'chart-ring', r: 6 }, cross);
      node('circle', { class: 'chart-dot', r: 4 }, cross);

      plot.insertBefore(svg, tip);
      if (idx >= 0) show(idx);
    }

    const fromPointer = (event) => {
      const box = plot.getBoundingClientRect();
      show(Math.round(((event.clientX - box.left - M.l) / (W - M.l - M.r)) * (n - 1)));
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

    if ('ResizeObserver' in window) new ResizeObserver(draw).observe(plot);
    else { window.addEventListener('resize', draw); draw(); }

    $('tbody', root).replaceChildren(...ranks.map((rank, i) => h('tr', {}, h('td', {}, fullDate(dates[i])), h('td', {}, fmtRank(rank)))).reverse());
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
      delete img.dataset.fellBack;
      img.onerror = link.dataset.original ? fallBackTo(link.dataset.original) : null;
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

  /* ---------- falling sakura petals (Perfect Cherry Blossom, but calmer) ---------- */
  function petals() {
    const canvas = $('#petals');
    const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
    if (!ctx) return;

    const colors = ['#ffd6e5', '#f9bcd2', '#f5a3c0', '#fbe3ec', '#eb92b8', '#f7c6da'];
    const rand = (a, b) => a + Math.random() * (b - a);
    let w = 0;
    let h = 0;
    let list = [];
    let raf = 0;
    let last = 0;
    let running = false;

    const make = (x, y, burst) => {
      const s = rand(7, 14);
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
        a: rand(0.3, 0.7),
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
      const want = Math.round(Math.min(22, Math.max(6, (w * h) / 80000)));
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
    $('.hero-art .avatar')?.addEventListener('click', (event) => burst(event.clientX, event.clientY, 36));
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

  /* ---------- live data: GitHub and the AUR, fetched on every visit ---------- */
  // same picks and shapes as scripts/update-data.mjs, which keeps a copy in data/site.json for when these fail
  const GITHUB_USER = 'Lecer69';
  const AUR_MAINTAINER = 'Lecer';

  const request = async (url, options = {}) => {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout?.(10000) });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return res;
  };
  const getJson = async (url) => (await request(url)).json();
  const githubApi = (path) => getJson(`https://api.github.com/${path}`);

  async function liveRepos() {
    const repos = await githubApi(`users/${GITHUB_USER}/repos?per_page=100&type=owner&sort=pushed`);
    // everything public and non-fork that has code, minus the profile README and site repos
    const shown = repos
      .filter((r) => !r.fork && !r.archived && r.language && r.name !== GITHUB_USER && !r.name.endsWith('.github.io'))
      .sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
    return Promise.all(shown.map(async (r) => ({
      name: r.name,
      url: r.html_url,
      description: r.description,
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      forks: r.forks_count,
      pushedAt: r.pushed_at,
      version: await latestTag(r.full_name),
    })));
  }

  // newest tag rather than newest release: not every version gets a GitHub release
  async function latestTag(fullName) {
    const tags = await githubApi(`repos/${fullName}/tags?per_page=100`);
    const [newest] = tags.map((t) => t.name).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
    return newest ? { tag: newest, url: `https://github.com/${fullName}/releases/tag/${encodeURIComponent(newest)}` } : null;
  }

  // the badges under "## Skills" in the profile README, by their alt text
  async function liveSkills() {
    const res = await request(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_USER}/readme`, { headers: { Accept: 'application/vnd.github.raw' } });
    const section = (await res.text()).split(/^##\s+/m).find((part) => /^skills\b/i.test(part)) ?? '';
    // only parsed, never put on the page; a DOMParser document runs no scripts and loads nothing
    const doc = new DOMParser().parseFromString(section, 'text/html');
    return $$('img[alt]', doc).map((img) => img.alt.trim()).filter(Boolean);
  }

  // github.com's calendar can't be read cross-origin, so this goes through a public API that scrapes it
  // (cached there for up to an hour): y=last is the calendar on the profile, y=all has the yearly totals
  async function liveContributions() {
    const api = `https://github-contributions-api.jogruber.de/v4/${GITHUB_USER}`;
    const [all, last] = await Promise.all([getJson(`${api}?y=all`), getJson(`${api}?y=last`)]);
    const years = Object.entries(all.total)
      .filter(([year]) => /^\d{4}$/.test(year))
      .map(([year, total]) => ({ year: Number(year), total }))
      .sort((a, b) => a.year - b.year);
    const days = [...last.contributions].sort((a, b) => a.date.localeCompare(b.date));
    if (!years.length || !days.length) throw new Error('the contributions API sent no data');
    return {
      total: years.reduce((sum, y) => sum + y.total, 0),
      since: years[0].year,
      years,
      lastYear: last.total.lastYear,
      calendar: { start: days[0].date, counts: days.map((d) => d.count), levels: days.map((d) => d.level) },
    };
  }

  // the AUR's RPC sends no CORS headers, but it does answer JSONP
  const jsonp = (url, timeout = 10000) => new Promise((resolve, reject) => {
    const name = `jsonp${Date.now()}${Math.floor(Math.random() * 1e6)}`;
    const script = document.createElement('script');
    const finish = (settle, value) => {
      window.clearTimeout(timer);
      window[name] = () => {}; // an answer that turns up after the timeout lands here
      script.remove();
      settle(value);
    };
    const timer = window.setTimeout(() => finish(reject, new Error(`${url} timed out`)), timeout);
    window[name] = (value) => finish(resolve, value);
    script.onerror = () => finish(reject, new Error(`${url} didn't load`));
    script.src = `${url}${url.includes('?') ? '&' : '?'}callback=${name}`;
    document.head.append(script);
  });

  async function liveAur() {
    const res = await jsonp(`https://aur.archlinux.org/rpc/v5/search/${encodeURIComponent(AUR_MAINTAINER)}?by=maintainer`);
    if (res.type === 'error') throw new Error(`AUR: ${res.error}`);
    return res.results
      .map((p) => ({
        name: p.Name,
        version: p.Version,
        description: p.Description,
        votes: p.NumVotes,
        popularity: p.Popularity,
        upstream: p.URL,
        url: `https://aur.archlinux.org/packages/${p.Name}`,
        updatedAt: new Date(p.LastModified * 1000).toISOString(),
        outOfDate: Boolean(p.OutOfDate),
      }))
      .sort((a, b) => b.votes - a.votes || b.popularity - a.popularity || a.name.localeCompare(b.name));
  }

  /* ---------- load it all ---------- */
  // data/site.json paints the page first, then each live source replaces its part as it answers;
  // one that fails leaves the copy from data/site.json in place
  async function loadData() {
    if (!$('[data-bind], [data-render]')) return; // e.g. the 404 page

    const live = { repos: liveRepos(), skills: liveSkills(), contributions: liveContributions(), aur: liveAur() };
    // they're awaited once the snapshot is on the page; until then an early failure isn't an unhandled one
    for (const promise of Object.values(live)) promise.catch(() => {});

    let data = {};
    try {
      const res = await fetch('data/site.json', { credentials: 'same-origin' });
      if (res.ok) data = await res.json();
    } catch (err) {
      console.error(err);
    }

    const pending = new Set(Object.keys(live));
    run(bind, data, pending);
    run(renderDumble, data);
    run(renderRepos, data);
    run(renderAur, data);
    run(renderSkills, data);
    run(renderCalendar, data);
    run(renderScreenshots, data);
    run(renderModules, data);
    run(renderGrades, data);
    run(rankChart, data);

    const swap = async (key, apply, ...renderers) => {
      try {
        apply(await live[key]);
        for (const render of renderers) run(render, data);
      } catch (err) {
        console.warn(`Live ${key} didn't load, so the copy from data/site.json stays.`, err);
      }
      pending.delete(key);
      run(bind, data, pending);
    };
    const github = (part) => { data.github = { ...data.github, ...part }; };
    await Promise.all([
      swap('repos', (repos) => github({ repos }), renderRepos),
      swap('skills', (skills) => github({ skills }), renderSkills),
      swap('contributions', (contributions) => github({ contributions }), renderCalendar),
      swap('aur', (aur) => { data.aur = aur; }, renderAur, renderRepos),
    ]);
    for (const el of $$('[aria-busy]')) el.removeAttribute('aria-busy');
  }

  run(reveal);
  run(navState);
  run(copyButtons);
  run(lightbox);
  run(petals);
  loadData();
})();
