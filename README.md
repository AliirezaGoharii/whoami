# Alireza Gohari · Portfolio

A self-hosted, framework-free portfolio for a Laravel / Vue web architect. Dark crimson, warm parchment, local typography, and two custom animated ASCII scenes.

## Work on the site

Edit the source files, then build:

```sh
python3 build.py
python3 -m http.server 8000 --bind 127.0.0.1
```

Open `http://127.0.0.1:8000`. Re-run the build after editing a source file, then refresh.

The build uses only Python’s standard library. It embeds the CSS, JavaScript, icons, and dashboard SVG into `index.html`. No bundler, framework, CDN, or font service is required. It writes the output atomically so a running server never serves a half-written page.

| File | Purpose |
| --- | --- |
| `src/index.html` | Content, landmarks, native stack disclosures, preview dialog |
| `src/styles.css` | Themes, layout, components, responsive rules, motion and print styles |
| `src/scripts/bootstrap.js` | Apply saved theme/motion before the first paint |
| `src/scripts/app.js` | Navigation, preferences, disclosures, preview, clipboard, reveals |
| `src/scripts/ascii.js` | Hero contours and document-aligned signal circuits |
| `zenith.svg` | Single source for the inline dashboard and full-size preview |
| `build.py` | Reproducible single-page build; `--check` detects stale output |
| `make-og.py` | Reproducible 1200×630 social image |
| `index.html` | Generated deployable page |

## Checks

Python 3.10+ and Node.js 20+ are used for verification. Install the CSS parser once:

```sh
python3 -m pip install -r requirements-dev.txt
python3 tools/check.py
```

Checks cover build freshness, HTML structure and references, local assets, CSS parsing, JavaScript/Python syntax, and behavior-focused UI and ASCII lifecycle tests. The Node tests use a controlled DOM/canvas harness; browser layout, native dialog behavior, and visual polish should also be reviewed in a browser.

## Interactions and motion

- The stack map uses native `<details>` disclosures and works without JavaScript.
- The dashboard’s **Explore** link opens a keyboard-accessible native dialog. Its full-size SVG link also works without scripting.
- The navbar name appears when the hero has passed the navbar.
- The footer’s **Motion** button pauses/resumes decorative animations, including both ASCII canvases. System reduced-motion is the default; an explicit choice is saved as `ag-motion`.
- Theme preference is saved as `ag-theme`. Blocked storage does not prevent the page from working.
- ASCII rendering pauses in hidden tabs and behind open menus/previews. Only the visible circuit rows are painted; canvas backing stores are capped at four million pixels each.
- The backgrounds are decorative, ignore pointer events, and are hidden from assistive technology and print.

## Social preview

```sh
python3 make-og.py
```

Regeneration needs a system FreeType library. The generator prefers the local fonts and has Android/Linux fallback font paths. The normal site build uses the committed `og.png` and does not need FreeType. `--output path.png` writes an alternative preview. Importing the generator exposes its drawing helpers without writing files.

## Deploy or share

Deploy `index.html`, `fonts/`, `zenith.svg`, and `og.png` to a static host. Keep the canonical and social URLs in `src/index.html` aligned with the final host.

`./live.sh` rebuilds the page, starts a local server, and creates a temporary Cloudflare tunnel. `./live.sh ssh` uses the existing SSH alternative.
