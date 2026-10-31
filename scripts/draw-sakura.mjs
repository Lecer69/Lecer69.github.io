#!/usr/bin/env node
/*
 * Draws the weeping cherry tree over the hero avatar: assets/img/sakura-back.svg (behind the
 * avatar) and assets/img/sakura-front.svg (the strands that hang in front of it).
 * Seeded, so the same seed always draws the same tree:  node scripts/draw-sakura.mjs [seed]
 *
 * Both files share a 600 × 600 box; the avatar circle sits at AVATAR (the hero CSS matches it).
 */
import { writeFile } from 'node:fs/promises';

const SEED = Number(process.argv[2] ?? 1214);
const SIZE = 600;
const EDGE = 16; // keep blossoms this far inside the box
const AVATAR = { x: 300, y: 372, r: 158 };

/* ---------- seeded randomness ---------- */
let state = SEED >>> 0;
const rand = () => {
  state = (state + 0x6d2b79f5) >>> 0;
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const between = (a, b) => a + rand() * (b - a);
const pick = (list) => list[Math.floor(rand() * list.length)];
const f = (n) => (Math.round(n * 10) / 10).toString();
const s2 = (n) => (Math.round(n * 100) / 100).toString();

/* ---------- geometry ---------- */
const DOWN = Math.PI / 2;
const UP = -Math.PI / 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// a smooth path through hand-placed control points
function spline(points, step = 5) {
  const out = [];
  const P = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      out.push([0, 1].map((k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)));
    }
  }
  out.push(points[points.length - 1]);
  return out;
}

const touchesAvatar = (x, y, pad = 0) => Math.hypot(x - AVATAR.x, y - AVATAR.y) < AVATAR.r + pad;
const inside = (x, y) => x > EDGE && x < SIZE - EDGE && y > EDGE && y < SIZE - EDGE;

/* ---------- the tree ---------- */
const branches = []; // { pts, w0, w1, depth, front, sway }
const flowers = []; // { x, y, s, rot, squash, kind, dim, front, sway }

const widthAt = (b, i) => b.w0 + (b.w1 - b.w0) * Math.pow(i / (b.pts.length - 1), 0.8);

function addBranch(pts, w0, w1, depth, opts = {}) {
  const branch = { pts, w0, w1, depth, front: false, sway: opts.sway ?? null };
  branches.push(branch);
  return branch;
}

// walks a branch out from (x, y); positive `lift` bends it up, negative lets it droop
function walk(x, y, angle, length, lift) {
  const steps = Math.max(3, Math.round(length / 5));
  const pts = [[x, y]];
  let a = angle;
  const curl = between(-0.03, 0.03);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    a += curl + between(-0.09, 0.09);
    a += lift >= 0 ? lift * wrap(UP - a) : -lift * t * 2.4 * wrap(DOWN - a);
    x += Math.cos(a) * (length / steps);
    y += Math.sin(a) * (length / steps);
    pts.push([x, y]);
  }
  return pts;
}

// side branches along `parent`, mostly reaching up and out to fill the canopy
function branchOut(parent, { spacing, depth = parent.depth + 1, maxDepth = 3, lift = 0.04 }) {
  const total = parent.pts.length - 1;
  const count = Math.round(((total * 5) / spacing) * between(0.8, 1.2));
  for (let c = 0; c < count; c++) {
    const i = Math.floor(between(0.12, 0.95) * total);
    const [px, py] = parent.pts[i];
    const [qx, qy] = parent.pts[Math.min(total, i + 1)];
    const dir = Math.atan2(qy - py, qx - px);
    const side = rand() < 0.62 ? -1 : 1; // favour the upper side
    const width = Math.max(1, widthAt(parent, i) * between(0.42, 0.62));
    const length = between(28, 74) * (1.25 - depth * 0.2);
    const pts = walk(px, py, dir + side * between(0.45, 1.05), length, lift);
    const child = addBranch(pts, width, Math.max(0.6, width * 0.3), depth, { sway: parent.sway });
    if (depth < maxDepth && width > 1.6) branchOut(child, { spacing: spacing * 1.25, maxDepth, lift });
    bloom(child, { along: 0.15, cluster: [2, 4], tip: [5, 9] });
  }
}

function bloom(branch, { along, cluster: [lo, hi], tip: [tipLo, tipHi] }) {
  const total = branch.pts.length - 1;
  for (let i = 2; i <= total; i++) {
    if (widthAt(branch, i) > 3.6) continue; // no flowers straight on the thick wood
    const isTip = i === total;
    if (!isTip && rand() > along) continue;
    const [x, y] = branch.pts[i];
    const count = Math.round(isTip ? between(tipLo, tipHi) : between(lo, hi));
    const far = rand() < 0.55 ? Math.round(between(1, 2.4)) : 0;
    for (let k = 0; k < count + far; k++) {
      const isFar = k >= count;
      const r = isFar ? between(6, 16) : k === 0 ? between(0, 3) : between(3, 10);
      const t = between(0, Math.PI * 2);
      const fx = x + Math.cos(t) * r;
      const fy = y + Math.sin(t) * r * 0.8 + 1.5;
      if (!inside(fx, fy)) continue;
      const bud = !isFar && rand() < 0.1;
      flowers.push({
        x: fx,
        y: fy,
        s: bud ? between(0.5, 0.66) : isFar ? between(0.8, 1.15) : between(0.42, 0.92),
        rot: between(0, 360),
        squash: !bud && rand() < 0.3 ? between(0.5, 0.78) : 1,
        kind: bud ? 'bud' : pick(['a', 'a', 'b', 'b', 'c', 'd']),
        dim: !isFar && rand() < 0.25,
        far: isFar,
        front: false,
        sway: branch.sway,
        branch,
      });
    }
  }
}

/* trunk and the big limbs, placed by hand so the canopy arches over the avatar */
const trunk = addBranch(spline([[34, 640], [60, 548], [72, 450], [94, 356], [124, 274], [162, 206]], 4), 44, 16, 0);
const arch = addBranch(spline([[156, 210], [222, 170], [300, 150], [380, 148], [450, 162], [508, 190], [550, 226]], 4), 15, 3, 1);
const upLeft = addBranch(spline([[160, 210], [142, 166], [122, 124], [96, 90], [64, 66]], 4), 10, 2.4, 1);
const upMid = addBranch(spline([[296, 152], [312, 116], [338, 84], [374, 62], [414, 50]], 4), 8, 2, 1);
const upRight = addBranch(spline([[452, 163], [474, 128], [506, 102], [546, 88]], 4), 6, 1.8, 1);

branchOut(arch, { spacing: 34 });
branchOut(upLeft, { spacing: 30 });
branchOut(upMid, { spacing: 30 });
branchOut(upRight, { spacing: 30 });
for (const limb of [arch, upLeft, upMid, upRight]) bloom(limb, { along: 0.12, cluster: [2, 4], tip: [5, 8] });

// two low shoots off the trunk
for (const [at, angle, length] of [[0.5, -2.6, 64], [0.7, -2.2, 80]]) {
  const [x, y] = trunk.pts[Math.floor(trunk.pts.length * at)];
  const shoot = addBranch(walk(x, y, angle, length, 0.035), 5, 1.4, 2);
  branchOut(shoot, { spacing: 34, maxDepth: 3 });
  bloom(shoot, { along: 0.15, cluster: [2, 4], tip: [5, 8] });
}

/* weeping strands: thin and strung with flowers; the ones that reach the avatar hang in front */
function strand(parent, at, length) {
  const [x, y] = parent.pts[Math.floor(at * (parent.pts.length - 1))];
  // dur and delay drove the old sway animation; they still draw from the RNG so the seed keeps its tree
  const sway = { x, y, dur: between(5.5, 9.5), delay: -between(0, 9) };
  const pts = walk(x, y + 1, DOWN + between(-0.7, 0.7), length, -between(0.05, 0.09));
  const s = addBranch(pts, between(1.3, 1.8), 0.6, 3, { sway });
  bloom(s, { along: 0.28, cluster: [1, 3], tip: [3, 5] });
  if (pts.some(([px, py]) => touchesAvatar(px, py, 4))) {
    s.front = true;
    for (const fl of flowers) if (fl.branch === s) fl.front = true;
  }
}
for (let i = 0; i < 18; i++) {
  const at = between(0.1, 1);
  const x = arch.pts[Math.floor(at * (arch.pts.length - 1))][0];
  const overFace = x > 200 && x < 400;
  strand(arch, at, overFace ? between(30, 72) : between(90, 190));
}
for (let i = 0; i < 4; i++) strand(upLeft, between(0.3, 1), between(60, 120));

// blossoms that land on the avatar's rim: in front of it when their twig is, hidden behind it otherwise
for (const fl of flowers) if (!fl.front && fl.branch.front) fl.front = true;

/* ---------- SVG ---------- */
function outline(b) {
  const { pts } = b;
  const left = [];
  const right = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[Math.max(0, i - 1)];
    const [x1, y1] = pts[Math.min(pts.length - 1, i + 1)];
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const nx = -(y1 - y0) / len;
    const ny = (x1 - x0) / len;
    const w = widthAt(b, i) / 2;
    left.push([pts[i][0] + nx * w, pts[i][1] + ny * w]);
    right.push([pts[i][0] - nx * w, pts[i][1] - ny * w]);
  }
  const line = (list) => list.map(([x, y]) => `${f(x)} ${f(y)}`).join(' ');
  const tipR = Math.max(0.3, widthAt(b, pts.length - 1) / 2);
  const [rx, ry] = right[right.length - 1];
  return `M${line(left)} A${f(tipR)} ${f(tipR)} 0 0 1 ${f(rx)} ${f(ry)} L${line(right.reverse())}Z`;
}

// a thin lighter line along the top of thick wood, so it reads as round
function highlight(b) {
  const idx = b.pts.map((_, i) => i).filter((i) => widthAt(b, i) > 3.5);
  if (idx.length < 3) return '';
  return `M${idx.map((i) => `${f(b.pts[i][0] - widthAt(b, i) * 0.14)} ${f(b.pts[i][1] - widthAt(b, i) * 0.24)}`).join(' ')}`;
}

const defs = `<defs>
<radialGradient id="pa" cx="0" cy="0" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#d4507f"/><stop offset=".36" stop-color="#f39abb"/><stop offset="1" stop-color="#ffe3ed"/></radialGradient>
<radialGradient id="pb" cx="0" cy="0" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#e2729e"/><stop offset=".42" stop-color="#f9cadb"/><stop offset="1" stop-color="#fff5f8"/></radialGradient>
<radialGradient id="pc" cx="0" cy="0" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#ec98b9"/><stop offset=".5" stop-color="#ffeef4"/><stop offset="1" stop-color="#fff"/></radialGradient>
<radialGradient id="pd" cx="0" cy="0" r="11" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#a92a5c"/><stop offset=".4" stop-color="#e06a97"/><stop offset="1" stop-color="#ffbfd5"/></radialGradient>
<filter id="blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.4"/></filter>
<path id="petal" d="M0 0C-4.6-2.2-5.6-8-1.7-10.6L0-9.1l1.7-1.5C5.6-8 4.6-2.2 0 0Z"/>
<g id="heart"><circle r="1.9" fill="#b83a6a"/><g fill="#ffd38a"><circle cy="-3.4" r=".75"/><circle cx="3.2" cy="-1" r=".75"/><circle cx="2" cy="2.8" r=".75"/><circle cx="-2" cy="2.8" r=".75"/><circle cx="-3.2" cy="-1" r=".75"/></g></g>
${['a', 'b', 'c', 'd'].map((k) => `<g id="f${k}"><g fill="url(#p${k})" stroke="#6d1f41" stroke-opacity=".4" stroke-width=".5"><use href="#petal"/><use href="#petal" transform="rotate(72)"/><use href="#petal" transform="rotate(144)"/><use href="#petal" transform="rotate(216)"/><use href="#petal" transform="rotate(288)"/></g><use href="#heart"/></g>`).join('\n')}
<g id="ff" fill="#f6b6cd"><use href="#petal"/><use href="#petal" transform="rotate(72)"/><use href="#petal" transform="rotate(144)"/><use href="#petal" transform="rotate(216)"/><use href="#petal" transform="rotate(288)"/></g>
<g id="fbud"><path d="M0 4C-3.4 1-3-5 0-7.5 3-5 3.4 1 0 4Z" fill="#e2608f" stroke="#6d1f41" stroke-opacity=".45" stroke-width=".5"/></g>
</defs>`;

const style = `<style>
.wood{fill:#3a2330}
.shine{fill:none;stroke:#7a4b62;stroke-opacity:.6;stroke-linecap:round;stroke-linejoin:round}
.dim{opacity:.58}
.far{opacity:.34;filter:url(#blur)}
</style>`;

function render(front) {
  // no animation in here: an animated SVG image is redrawn in full every frame, ~1,300 blossoms and a blur
  // filter, which made the hero lag; a strand's flowers are still drawn right after the strand
  const groups = new Map(); // strand → markup
  const add = (sway, markup) => groups.set(sway, (groups.get(sway) ?? '') + markup);
  for (const b of branches) {
    if (b.front !== front) continue;
    add(b.sway, `<path class="wood" d="${outline(b)}"/>`);
    const shine = highlight(b);
    if (shine) add(b.sway, `<path class="shine" stroke-width="${f(Math.max(1, b.w0 * 0.1))}" d="${shine}"/>`);
  }
  const use = (fl) => `<use href="#f${fl.far ? 'f' : fl.kind}"${fl.dim ? ' class="dim"' : ''} transform="translate(${f(fl.x)} ${f(fl.y)}) rotate(${Math.round(fl.rot)}) scale(${s2(fl.s)}${fl.squash !== 1 ? ` ${s2(fl.s * fl.squash)}` : ''})"/>`;
  const mine = flowers.filter((fl) => fl.front === front);
  // out-of-focus blossoms behind everything, in one blurred group (one filter pass, not hundreds)
  const far = mine.filter((fl) => fl.far && !fl.sway);
  const near = mine.filter((fl) => !far.includes(fl)).sort((a, b) => Number(b.far) - Number(a.far) || Number(b.dim) - Number(a.dim) || a.s - b.s);
  let backdrop = far.length ? `<g class="far">${far.map(use).join('')}</g>` : '';
  for (const fl of near) add(fl.sway, use(fl).replace('<use ', fl.far ? '<use opacity=".3" ' : '<use '));
  let body = backdrop ? `\n${backdrop}` : '';
  for (const markup of groups.values()) body += `\n${markup}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}">\n${style}\n${defs}${body}\n</svg>\n`;
}

await writeFile(new URL('../assets/img/sakura-back.svg', import.meta.url), render(false));
await writeFile(new URL('../assets/img/sakura-front.svg', import.meta.url), render(true));
console.log(`seed ${SEED}: ${branches.length} branches, ${flowers.length} flowers (${flowers.filter((x) => x.front).length} in front)`);
