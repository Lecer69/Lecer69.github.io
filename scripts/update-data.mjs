#!/usr/bin/env node
/*
 * Collects everything the page shows into data/site.json.
 *
 * GitHub Actions runs this before every deploy and every two hours (.github/workflows/deploy.yml).
 * Locally: `node scripts/update-data.mjs` (Node 20+, no dependencies).
 *
 * The page loads the repos, contributions and AUR packages itself on every visit (assets/js/main.js);
 * `github` and `aur` here are the copy it paints first and keeps when one of those live calls fails.
 *
 * Sources
 *   osu      osu! API v2 when OSU_CLIENT_ID and OSU_CLIENT_SECRET are set, otherwise the public
 *            osu! website (same JSON, no key needed)
 *   github   GitHub REST API + the public contributions calendar on github.com
 *   dots     the dots-hyprland repo: the preview screenshot and the modules of the lis shell
 *   aur      AUR RPC, every package Lecer maintains
 *
 * When a source fails, its previous value is kept (from the last local run, or from the live
 * site in CI), so one flaky service can't blank a section.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const OSU_USER = 34021726;
const GITHUB_USER = 'Lecer69';
const AUR_MAINTAINER = 'Lecer';
const DOTS = { repo: 'dots-hyprland', screenshots: 'preview/', shell: 'dots/quickshell/lis/' };

const env = process.env;
const OUT = process.argv[2] ?? 'data/site.json';
const SITE_URL = (env.SITE_URL || 'https://lecer69.github.io').replace(/\/?$/, '/');
const UA = 'Lecer69 site data (+https://github.com/Lecer69)';

/* ---------- http ---------- */

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { headers = {}, method = 'GET', body, tries = 3, timeout = 30_000 } = {}) {
  let error;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, { method, body, headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(timeout) });
      if (res.ok) return res;
      error = new Error(`${method} ${url} → HTTP ${res.status}`);
      if (res.status < 500 && res.status !== 429) break; // retrying won't change a 404
    } catch (err) {
      error = err;
    }
    if (attempt < tries) await sleep(2000 * attempt);
  }
  throw error;
}

const getJson = async (url, options) => (await request(url, options)).json();
const getText = async (url, options) => (await request(url, options)).text();

const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, e) => {
  if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' }[e.toLowerCase()] ?? match;
});

const ghHeaders = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  ...(env.GITHUB_TOKEN ? { Authorization: `Bearer ${env.GITHUB_TOKEN}` } : {}),
};
const gh = (path) => getJson(`https://api.github.com/${path}`, { headers: ghHeaders });

/* ---------- osu! ---------- */

async function osu() {
  const { OSU_CLIENT_ID: id, OSU_CLIENT_SECRET: secret } = env;
  return normaliseOsu(id && secret ? await osuFromApi(id, secret) : await osuFromWebsite());
}

async function osuFromApi(clientId, clientSecret) {
  const { access_token: token } = await getJson('https://osu.ppy.sh/oauth/token', {
    method: 'POST',
    headers: { Accept: 'application/json' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', scope: 'public' }),
  });
  // x-api-version asks for the current response format, the same one the website returns
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json', 'x-api-version': '20240529' };
  const user = await getJson(`https://osu.ppy.sh/api/v2/users/${OSU_USER}/osu`, { headers });
  return { source: 'api', user };
}

async function osuFromWebsite() {
  const page = await getText(`https://osu.ppy.sh/users/${OSU_USER}/osu`);
  const match = page.match(/data-initial-data="([^"]*)"/);
  if (!match) throw new Error('the osu! profile page has no initial data any more');
  const { user } = JSON.parse(decodeEntities(match[1]));
  return { source: 'website', user };
}

function normaliseOsu({ source, user: u }) {
  const st = u.statistics;
  const history = u.rank_history ?? u.rankHistory;

  return {
    source,
    user: {
      id: u.id,
      username: u.username,
      previousUsernames: u.previous_usernames ?? [],
      url: `https://osu.ppy.sh/users/${u.id}`,
      avatar: u.avatar_url,
      cover: u.cover?.url ?? u.cover_url ?? null,
      country: u.country ?? { code: u.country_code, name: u.country_code },
      team: u.team ? { id: u.team.id, name: u.team.name, shortName: u.team.short_name, flag: u.team.flag_url, url: `https://osu.ppy.sh/teams/${u.team.id}` } : null,
      supporter: Boolean(u.is_supporter),
      supportLevel: u.support_level ?? 0,
      joinDate: u.join_date,
      lastVisit: u.last_visit ?? null,
      online: Boolean(u.is_online),
      playstyle: u.playstyle ?? [],
      medals: u.user_achievements?.length ?? 0,
    },
    stats: {
      globalRank: st.global_rank,
      countryRank: st.country_rank,
      pp: st.pp,
      accuracy: st.hit_accuracy,
      playCount: st.play_count,
      playTime: st.play_time,
      maxCombo: st.maximum_combo,
      rankedScore: st.ranked_score,
      totalHits: st.total_hits,
      level: st.level?.current ?? null,
      levelProgress: st.level?.progress ?? null,
      grades: st.grade_counts,
    },
    rankHighest: u.rank_highest ? { rank: u.rank_highest.rank, date: u.rank_highest.updated_at } : null,
    rankHistory: history?.data ?? [],
  };
}

/* ---------- GitHub ---------- */

async function github() {
  const [user, repos, readme, calendar] = await Promise.all([
    gh(`users/${GITHUB_USER}`),
    gh(`users/${GITHUB_USER}/repos?per_page=100&type=owner&sort=pushed`),
    getText(`https://api.github.com/repos/${GITHUB_USER}/${GITHUB_USER}/readme`, { headers: { ...ghHeaders, Accept: 'application/vnd.github.raw' } }).catch(() => ''),
    contributionsPage(),
  ]);

  // everything public and non-fork that has code, minus the profile README and site repos
  const shown = repos
    .filter((r) => !r.fork && !r.archived && r.language && r.name !== GITHUB_USER && !r.name.endsWith('.github.io'))
    .sort((a, b) => b.stargazers_count - a.stargazers_count || Date.parse(b.pushed_at) - Date.parse(a.pushed_at));

  const firstYear = new Date(user.created_at).getUTCFullYear();
  const thisYear = new Date().getUTCFullYear();
  const years = await Promise.all(
    Array.from({ length: thisYear - firstYear + 1 }, (_, i) => firstYear + i).map(async (year) => ({
      year,
      total: parseContributionTotal(await contributionsPage(`?from=${year}-01-01&to=${year}-12-31`)),
    })),
  );

  return {
    user: {
      login: user.login,
      name: user.name,
      url: user.html_url,
      avatar: user.avatar_url,
      location: user.location,
      createdAt: user.created_at,
      publicRepos: user.public_repos,
      followers: user.followers,
    },
    repos: await Promise.all(shown.map(async (r) => ({
      name: r.name,
      url: r.html_url,
      description: r.description,
      language: r.language,
      topics: r.topics ?? [],
      stars: r.stargazers_count,
      forks: r.forks_count,
      pushedAt: r.pushed_at,
      version: await latestTag(r.full_name),
    }))),
    skills: readmeSkills(readme),
    contributions: {
      total: years.reduce((sum, y) => sum + y.total, 0),
      since: firstYear,
      years,
      lastYear: parseContributionTotal(calendar),
      calendar: parseCalendar(calendar),
    },
  };
}

const contributionsPage = (query = '') => getText(`https://github.com/users/${GITHUB_USER}/contributions${query}`);

// newest tag rather than newest release: not every version gets a GitHub release
async function latestTag(fullName) {
  const tags = await gh(`repos/${fullName}/tags?per_page=100`);
  const [newest] = tags.map((t) => t.name).sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  return newest ? { tag: newest, url: `https://github.com/${fullName}/releases/tag/${encodeURIComponent(newest)}` } : null;
}

function parseContributionTotal(html) {
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const match = text.match(/([\d,]+|No) contributions? in (the last year|\d{4})/i);
  if (!match) throw new Error('the contributions page has no total any more');
  return match[1].toLowerCase() === 'no' ? 0 : Number(match[1].replace(/,/g, ''));
}

// daily counts for the last year, oldest first, as one contiguous run starting at `start`
function parseCalendar(html) {
  const counts = new Map();
  for (const [, id, label] of html.matchAll(/<tool-tip[^>]*\bfor="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
    const n = label.match(/^([\d,]+) contributions?/);
    counts.set(id, n ? Number(n[1].replace(/,/g, '')) : 0);
  }
  const days = [];
  for (const [tag] of html.matchAll(/<td\b[^>]*\bdata-date="[^"]+"[^>]*>/g)) {
    const attr = (name) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
    days.push({ date: attr('data-date'), level: Number(attr('data-level') ?? 0), count: counts.get(attr('id')) ?? 0 });
  }
  if (!days.length) throw new Error('the contributions calendar has no days any more');
  days.sort((a, b) => a.date.localeCompare(b.date));
  return { start: days[0].date, counts: days.map((d) => d.count), levels: days.map((d) => d.level) };
}

// the badges under "## Skills" in the profile README, by their alt text
function readmeSkills(readme) {
  const section = readme.split(/^##\s+/m).find((part) => /^skills\b/i.test(part)) ?? '';
  return [...section.matchAll(/<img[^>]*\balt="([^"]+)"/gi)].map((m) => decodeEntities(m[1]).trim());
}

/* ---------- dots-hyprland ---------- */

async function dots() {
  const path = `repos/${GITHUB_USER}/${DOTS.repo}`;
  const repo = await gh(path);
  const branch = await gh(`${path}/branches/${repo.default_branch}`);
  const sha = branch.commit.sha;
  const { tree } = await gh(`${path}/git/trees/${sha}?recursive=1`);
  // pinned to the commit, so image caches can't serve an old screenshot under the same URL
  const raw = (file) => `https://raw.githubusercontent.com/${GITHUB_USER}/${DOTS.repo}/${sha}/${file}`;

  const screenshots = tree
    .filter((e) => e.type === 'blob' && e.path.startsWith(DOTS.screenshots) && /\.(png|jpe?g|webp)$/i.test(e.path))
    .sort((a, b) => a.path.localeCompare(b.path, 'en', { numeric: true }))
    .map((e) => raw(e.path));
  const modules = tree
    .filter((e) => e.type === 'tree' && e.path.startsWith(DOTS.shell) && !e.path.slice(DOTS.shell.length).includes('/'))
    .map((e) => e.path.slice(DOTS.shell.length));
  return {
    url: repo.html_url,
    stars: repo.stargazers_count,
    updatedAt: branch.commit.commit.committer.date,
    commit: { sha: sha.slice(0, 7), url: branch.commit.html_url, message: branch.commit.commit.message.split('\n')[0] },
    screenshots,
    modules,
  };
}

/* ---------- AUR ---------- */

async function aur() {
  const res = await getJson(`https://aur.archlinux.org/rpc/v5/search/${encodeURIComponent(AUR_MAINTAINER)}?by=maintainer`);
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

/* ---------- main ---------- */

const sources = { osu, github, dots, aur };

const log = (level, message) => {
  if (env.GITHUB_ACTIONS && level !== 'notice') console.log(`::${level}::${message}`);
  else console.log(`${level === 'notice' ? '·' : '!'} ${message}`);
};

// what to fall back on: the last local run, or (in CI, where there is none) the live site
const previous = await readFile(OUT, 'utf8').then(JSON.parse)
  .catch(() => getJson(new URL('data/site.json', SITE_URL), { tries: 1, timeout: 10_000 }))
  .catch(() => ({}));
const data = { generatedAt: new Date().toISOString() };
let failed = 0;

await Promise.all(Object.entries(sources).map(async ([key, load]) => {
  const started = Date.now();
  try {
    data[key] = await load(previous[key]);
    log('notice', `${key}: ok in ${((Date.now() - started) / 1000).toFixed(1)}s${data[key] === null ? ' (not configured)' : ''}`);
  } catch (err) {
    failed++;
    data[key] = previous[key] ?? null;
    log('warning', `${key}: ${err.message}${previous[key] ? ', kept the previous data' : ''}`);
  }
}));

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, JSON.stringify(data));
log('notice', `wrote ${OUT}`);

if (failed === Object.keys(sources).length) process.exit(1);
