# lecer69.github.io

Personal site of **Lecer** (Arshia): Java developer behind the Dumble Land plugins, Hyprland ricer, osu! player.
Plain HTML, CSS and a little JavaScript, no build step. The theme is Saigyouji Yuyuko's *墨染の桜*, the ink-black cherry blossom.

**Live:** https://lecer69.github.io

## What's inside

| Path | |
|---|---|
| `index.html` | the whole page |
| `404.html` | "Lost in the Netherworld", served by GitHub Pages for any missing URL |
| `assets/css/style.css` | theme colours are tokens at the top (`--sakura`, `--ghost`, `--spiral`, …) |
| `assets/js/main.js` | petals, nav highlight, copy buttons, live GitHub stars, rank chart, lightbox, Spotify player on demand |
| `assets/img/` | avatar, osu! cover, rice screenshots (WebP), favicon, `og.jpg` link preview |
| `assets/fonts/shippori-jp.woff2` | only the Japanese glyphs the site uses (a 10 KB subset of Shippori Mincho) |

Preview locally with `python3 -m http.server` and open http://localhost:8000.

## Publish

`Lecer69/Lecer69.github.io` already exists. Its old `CNAME` points at `lecer.dev`, which no longer resolves,
so the current site redirects visitors to a dead domain. Replace the old files with this folder:

```bash
git clone https://github.com/Lecer69/Lecer69.github.io.git
cd Lecer69.github.io
git rm -q index.html CNAME
cp -r ~/Projects/Lecer/. .
git add -A
git commit -m "New Yuyuko-themed site"
git push
```

Then in **Settings → Pages**, make sure *Source* is "Deploy from a branch" (`main`, `/ (root)`) and the
*Custom domain* field is empty. The site shows up at https://lecer69.github.io a minute or two later.

## Keeping it fresh

- **osu! numbers** are a snapshot from 20 Oct 2026. They live in the osu! section of `index.html`: the stat tiles,
  the top plays, and the `rank-data` JSON (90 daily global ranks, oldest first, with `end` set to the date of the last one).
- **GitHub stars** refresh themselves in the browser. The numbers in the HTML are only the fallback.
- **Japanese text** ships as a subset. If you add new Japanese characters, regenerate the font with every character
  you use (the list below is the current set, plus whatever you add):

  ```bash
  curl -sG -A "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36" \
    --data-urlencode "family=Shippori Mincho:wght@600" \
    --data-urlencode "text= BLRcdefilnorstuy·、かせにの伍参反咲墨壱幽弐染桜楼玉白肆蝶迷陸雅魂" \
    https://fonts.googleapis.com/css2 \
    | grep -o "https://fonts.gstatic.com/[^)]*" | head -1 | xargs curl -s -o assets/fonts/shippori-jp.woff2
  ```

- Tap the avatar, or type `yuyuko` anywhere on the page.

## Credits

- Saigyouji Yuyuko is from Touhou Project by ZUN (Team Shanghai Alice). The avatar and osu! cover are fan art I use as
  profile pictures. The branch, butterflies, petals and hat emblem are drawn in SVG and canvas for this site.
- Brand icons from [Simple Icons](https://simpleicons.org) (CC0). Fonts: Inter, JetBrains Mono and Shippori Mincho (SIL Open Font License).
