# Lecer

Personal site of **Lecer** (Arshia): Java developer behind the Dumble Land plugins, Hyprland ricer, osu! player.
Plain HTML, CSS and JavaScript, no framework. Saigyouji Yuyuko theme, osu!-style layout.

Every number on the page is live. The repos, contributions and AUR packages are fetched by the visitor's browser
on every visit. The rest (osu!, the setup screenshots, Dumble Land) needs API keys or can't be read
from a browser, so a GitHub Actions workflow collects it into `data/site.json` before each deploy and again every
two hours. That file also keeps a copy of the live parts: the page paints from it first, then swaps in the live data,
and keeps the copy for anything that doesn't load.

## What's inside

| Path | |
|---|---|
| `index.html` | the page; live values are marked with `data-bind`, `data-render` and `data-requires` |
| `404.html` | "Lost in the Netherworld" |
| `assets/css/style.css` | colours are tokens at the top (`--bg-*`, `--pink`, `--sky`, grade colours, …) |
| `assets/js/main.js` | fetches the live data and renders it with `data/site.json`: repos, AUR list, contributions calendar, rank chart, screenshots; plus petals, copy buttons, lightbox |
| `assets/img/sakura-*.svg` | the weeping cherry over the avatar, drawn by `scripts/draw-sakura.mjs` |
| `scripts/update-data.mjs` | fetches everything into `data/site.json` (Node 20+, no dependencies) |
| `.github/workflows/deploy.yml` | runs the script and publishes to GitHub Pages |

## Where the data comes from

**Live, in the browser:**

| Section | Source |
|---|---|
| Repos, versions, stars, toolbox | GitHub API; the toolbox is the badge list under `## Skills` in the `Lecer69/Lecer69` README |
| Contributions | [github-contributions-api.jogruber.de](https://github.com/grubersjoe/github-contributions-api), which reads the public calendar on github.com (github.com itself can't be fetched from another site). It caches for up to an hour. Includes private contributions, if they're shown on the profile |
| AUR packages | AUR RPC, every package maintained by `Lecer`. The RPC sends no CORS headers, so it's loaded as JSONP |

Without a token, GitHub allows 60 API requests an hour per IP and a visit uses 5. A visitor who goes over that
(or a network that blocks one of these sites) gets the copy from `data/site.json` for that part.

**From `data/site.json`:**

| Section | Source |
|---|---|
| osu! profile and rank history | osu! API v2 (falls back to the public osu! website if no API keys are set) |
| Setup screenshot and lis modules | the `dots-hyprland` repo: every image in `preview/` and every folder in `dots/quickshell/lis/` |
| Dumble Land commit and line counts | GitHub API for the private repos, only when `DUMBLE_TOKEN` is set |

The script fetches the live sections too (straight from github.com for the contributions), as the fallback copy.
If a source is down, the script keeps that source's previous data instead of blanking the section.
Screenshots are resized on the fly by [wsrv.nl](https://wsrv.nl) (the originals are 2 MB PNGs).

## Publish

1. Push this folder to the repo you want to serve it from, on its default branch (`main`): scheduled runs only
   fire there, and Pages only accepts deploys from it.
2. **Settings → Pages → Source: GitHub Actions.**
3. Add the secrets under **Settings → Secrets and variables → Actions**:
   - `OSU_CLIENT_ID`, `OSU_CLIENT_SECRET`: create an OAuth application at
     [osu! settings → OAuth](https://osu.ppy.sh/home/account/edit#oauth) (any callback URL works, it isn't used).
     Without them the script reads the same numbers from the osu! website.
   - `DUMBLE_TOKEN` (optional): a GitHub token with read access to the Dumble-Development repos
     (fine-grained, *Contents* and *Metadata* read-only, or a classic token with `repo`). Without it the plugins show no numbers.
4. Run the **Deploy** workflow once from the Actions tab, or push a commit.

The workflow rewrites `https://lecer69.github.io/` in the pages to wherever the repo is actually served,
so it works from `Lecer69.github.io` or from a project repo like `LecerWebPage` (then the site lives at `/LecerWebPage/`).

**Heads-up:** `Lecer69/Lecer69.github.io` still has a `CNAME` for `lecer.dev`, which no longer resolves. While that
custom domain is set, GitHub redirects the user site *and* every project site to it. Delete that `CNAME`
(and clear *Custom domain* in that repo's Pages settings) wherever you publish. A private repo can only use Pages on a paid plan.

## Work on it locally

```bash
node scripts/update-data.mjs     # writes data/site.json; add OSU_CLIENT_ID/OSU_CLIENT_SECRET to use the API
python3 -m http.server           # then open http://localhost:8000
```

`data/` is git-ignored: it's rebuilt on every deploy. Without it, only the live sections show up. Locally, the osu! and
setup numbers only change when you run the script again.

Behind a proxy (`https_proxy` set), Node's `fetch` ignores it unless you start Node with `NODE_USE_ENV_PROXY=1`
(Node 22.21+), so every source times out and the script keeps the old data:

```bash
NODE_USE_ENV_PROXY=1 node scripts/update-data.mjs
```

`python3 -m http.server` sends no cache headers, so after changing a file, reload with Ctrl+Shift+R.

Redraw the tree with another seed (the avatar position is fixed, see `AVATAR` in the script and `.hero-art .avatar` in the CSS):

```bash
node scripts/draw-sakura.mjs 2024
```

Tap the avatar, or type `yuyuko` anywhere on the page.

## Credits

- Saigyouji Yuyuko is from Touhou Project by ZUN (Team Shanghai Alice). The avatars and osu! cover are fan art used as
  profile pictures and load from GitHub and osu!. The tree, butterflies and petals are drawn in SVG and canvas.
- Brand icons from [Simple Icons](https://simpleicons.org) (CC0). Fonts: Exo 2, DM Sans and JetBrains Mono (SIL Open Font License).
- Grade colours follow the osu! website.
