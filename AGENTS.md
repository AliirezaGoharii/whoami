# Portfolio maintenance

- Read `README.md` for the build and deployment files.
- `index.html` is generated. Edit `src/index.html`, `src/styles.css`, and `src/scripts/`, then run `python3 build.py`.
- `zenith.svg` is the shared dashboard source. The build embeds it in the page; the preview dialog loads the same file.
- Keep runtime assets local. The delivered page needs no framework, CDN, package installation, or server-side application.
- Preserve the portfolio's identity and project links unless the requested change calls for revising them.
- Decorative animation must follow `data-motion`, pause for `data-overlay`, and remain hidden from assistive technology. Preserve hero-only contour scoping and the page circuit's viewport-sized renderer.
- Favor native controls and progressive enhancement. The stack disclosures and preview link must remain useful without JavaScript.
- Run `python3 tools/check.py` after runtime/build changes. Its Node tests exercise a controlled DOM/canvas harness, not a real browser layout engine.
- Use `python3 make-og.py` when the social preview needs updating. It is independent of the normal build.
