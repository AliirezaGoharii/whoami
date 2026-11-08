(function () {
    'use strict';

    var root = document.documentElement;
    var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
    function motionActive() { return root.getAttribute('data-motion') !== 'off' && !root.hasAttribute('data-overlay'); }

    /* ---------- hero ASCII contours ---------- */
    (function () {
        var canvas = $('#heroAscii');
        var hero = $('#top');
        if (!canvas || !hero) return;
        var ctx = canvas.getContext('2d');
        var atlas = document.createElement('canvas');
        var glyphs = atlas.getContext('2d');
        if (!ctx || !glyphs) return;

        var print = window.matchMedia('print');
        var chars = ' .:-=+*#%@';
        var w = 0, h = 0, dpr = 1, cellW = 10, cellH = 15, sourceW = 0, sourceH = 0;
        var cells = [], palette, opacity = .56, font = 'monospace';
        var raf = 0, previous = 0, painted = 0, time = 4, inView = false;
        var frameInterval = 1000 / 30;

        function smooth(a, b, value) {
            var n = Math.max(0, Math.min(1, (value - a) / (b - a)));
            return n * n * (3 - 2 * n);
        }
        function readPalette() {
            var style = getComputedStyle(hero);
            opacity = parseFloat(style.getPropertyValue('--ascii-opacity'));
            font = style.getPropertyValue('--font-mono').trim() || 'monospace';
            palette = ctx.createLinearGradient(0, 0, w, h * .65);
            palette.addColorStop(0, style.getPropertyValue('--ascii-ink').trim());
            palette.addColorStop(.6, style.getPropertyValue('--ascii-accent').trim());
            palette.addColorStop(1, style.getPropertyValue('--ascii-ink').trim());
        }

        /* Cache the glyphs once per size/font change, rather than shaping text every frame. */
        function buildAtlas() {
            sourceW = Math.ceil(cellW * dpr);
            sourceH = Math.ceil(cellH * dpr);
            atlas.width = sourceW * chars.length;
            atlas.height = sourceH;
            glyphs.setTransform(sourceW / cellW, 0, 0, sourceH / cellH, 0, 0);
            glyphs.font = '500 ' + Math.round(cellW * 1.16) + 'px ' + font;
            glyphs.textAlign = 'center';
            glyphs.textBaseline = 'middle';
            glyphs.fillStyle = '#fff';
            for (var i = 1; i < chars.length; i++) {
                glyphs.fillText(chars[i], (i + .5) * cellW, cellH * .5);
            }
        }

        function drawGlyph(index, cell, alpha) {
            if (!index || alpha < .001) return;
            ctx.globalAlpha = alpha;
            ctx.drawImage(atlas, index * sourceW, 0, sourceW, sourceH, cell.x, cell.y, cellW, cellH);
        }
        function render() {
            if (!w || !h) return;
            ctx.clearRect(0, 0, w, h);
            for (var i = 0; i < cells.length; i++) {
                var cell = cells[i];
                var phase = cell.radius * 15 - time * .85
                    + Math.sin(cell.angle * 3 + time * .24) * 1.3
                    + Math.sin(cell.warp + time * .3) * .75;
                var wave = .5 + .5 * Math.cos(phase);
                var strength = wave * wave * wave;
                var level = strength * (chars.length - 1);
                var lower = Math.floor(level), blend = level - lower;
                var alpha = cell.fade * opacity * (.25 + strength * .75);
                /* Crossfade adjacent glyphs so the contours move without random character flashes. */
                drawGlyph(lower, cell, alpha * (1 - blend));
                if (lower < chars.length - 1) drawGlyph(lower + 1, cell, alpha * blend);
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-in';
            ctx.fillStyle = palette;
            ctx.fillRect(0, 0, w, h);
            ctx.globalCompositeOperation = 'source-over';
        }

        function canAnimate() {
            return w > 0 && h > 0 && inView && !document.hidden && motionActive() && !print.matches;
        }
        function frame(now) {
            raf = 0;
            if (!canAnimate()) { previous = 0; return; }
            if (previous) time += Math.min(now - previous, 100) / 1000;
            previous = now;
            if (now - painted >= frameInterval) {
                painted = now - (now - painted) % frameInterval;
                render();
            }
            raf = requestAnimationFrame(frame);
        }
        function sync() {
            if (canAnimate()) {
                if (!raf) { previous = 0; raf = requestAnimationFrame(frame); }
            } else {
                cancelAnimationFrame(raf);
                raf = 0;
                previous = 0;
            }
        }
        function resize(force) {
            var bounds = hero.getBoundingClientRect();
            var width = Math.round(bounds.width), height = Math.round(bounds.height);
            if (!width || !height) { inView = false; sync(); return; }
            var ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (width * height)));
            inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
            if (!force && width === w && height === h && ratio === dpr) { sync(); return; }
            w = width; h = height; dpr = ratio;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            /* Bound both the character count and the backing-store size on large/HiDPI screens. */
            cellW = Math.max(w < 768 ? 9 : 10, Math.ceil(Math.sqrt(w * h / 10500)));
            cellH = Math.ceil(cellW * 1.5);
            readPalette();
            buildAtlas();
            cells = [];
            var scale = Math.max(300, Math.min(w, h) * .85);
            var copy = $('.hero-copy', hero);
            var copyBox = copy ? copy.getBoundingClientRect() : null;
            for (var y = 0; y < h; y += cellH) {
                for (var x = 0; x < w; x += cellW) {
                    var nx = (x + cellW * .5) / w, ny = (y + cellH * .5) / h;
                    var fade = smooth(0, .07, nx) * smooth(0, .07, 1 - nx)
                        * smooth(0, .1, ny) * smooth(0, .16, 1 - ny);
                    if (copyBox) {
                        var dx = Math.max(copyBox.left - bounds.left - x, x - (copyBox.right - bounds.left), 0);
                        var dy = Math.max(copyBox.top - bounds.top - y, y - (copyBox.bottom - bounds.top), 0);
                        var quiet = w < 768 ? .4 : .24;
                        fade *= quiet + (1 - quiet) * smooth(0, 110, Math.sqrt(dx * dx + dy * dy));
                    }
                    if (fade < .002) continue;
                    var u = (x - w * .72) / scale, v = (y - h * .44) / scale;
                    cells.push({
                        x: x, y: y, fade: fade,
                        radius: Math.sqrt(u * u + v * v), angle: Math.atan2(v, u), warp: u * 3.4 - v * 2.5
                    });
                }
            }
            render();
            sync();
        }

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (entries) {
                inView = entries[0].isIntersecting;
                sync();
            }, { threshold: 0 }).observe(hero);
        } else {
            window.addEventListener('scroll', function () {
                var bounds = hero.getBoundingClientRect();
                inView = bounds.bottom > 0 && bounds.top < window.innerHeight;
                sync();
            }, { passive: true });
        }
        if ('ResizeObserver' in window) {
            new ResizeObserver(function () { resize(false); }).observe(hero);
        }
        window.addEventListener('resize', function () { resize(false); }, { passive: true });
        document.addEventListener('visibilitychange', sync);
        if (print.addEventListener) print.addEventListener('change', sync);
        else print.addListener(sync);
        new MutationObserver(function (changes) {
            if (changes.some(function (change) { return change.attributeName === 'data-theme'; })) { readPalette(); render(); }
            sync();
        }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-overlay'] });
        if (document.fonts) document.fonts.ready.then(function () { resize(true); });
        resize(true);
    })();

    /* ---------- page ASCII signal circuit ---------- */
    (function () {
        var canvas = $('#pageAscii'), hero = $('#top');
        if (!canvas || !hero) return;
        var ctx = canvas.getContext('2d');
        var atlas = document.createElement('canvas'), glyphs = atlas.getContext('2d');
        if (!ctx || !glyphs) return;

        var print = window.matchMedia('print');
        var chars = '|-+[]01*.';
        var w = 0, h = 0, dpr = 1, cellW = 12, cellH = 18, sourceW = 0, sourceH = 0;
        var contentTop = 0, pageHeight = 0, scroll = window.scrollY || 0;
        var rows = [], routes = [], opacity = .68;
        var raf = 0, previous = 0, painted = 0, time = 1.4, dirty = true;
        var frameInterval = 1000 / 30;

        function smooth(a, b, value) {
            var n = Math.max(0, Math.min(1, (value - a) / (b - a)));
            return n * n * (3 - 2 * n);
        }
        function buildAtlas() {
            var style = getComputedStyle(canvas);
            var colors = ['--circuit-ink', '--circuit-accent', '--circuit-spark'];
            opacity = parseFloat(style.getPropertyValue('--circuit-opacity'));
            sourceW = Math.ceil(cellW * dpr);
            sourceH = Math.ceil(cellH * dpr);
            atlas.width = sourceW * chars.length;
            atlas.height = sourceH * colors.length;
            glyphs.setTransform(sourceW / cellW, 0, 0, sourceH / cellH, 0, 0);
            glyphs.font = '500 ' + Math.round(cellW * 1.3) + 'px ' + (style.getPropertyValue('--font-mono').trim() || 'monospace');
            glyphs.textAlign = 'center';
            glyphs.textBaseline = 'middle';
            colors.forEach(function (color, row) {
                glyphs.fillStyle = style.getPropertyValue(color).trim();
                for (var i = 0; i < chars.length; i++) {
                    glyphs.fillText(chars[i], (i + .5) * cellW, (row + .5) * cellH);
                }
            });
        }

        /* Document-space routes stay attached to the page while only visible rows are painted. */
        function buildCircuit() {
            rows = []; routes = [];
            var columns = Math.ceil(w / cellW);
            var count = Math.max(1, Math.ceil((pageHeight - contentTop) / cellH));
            var lanes = Math.max(4, Math.min(12, Math.round(w / 150)));
            var pitch = columns / lanes;
            var laneColumns = [], grid = Object.create(null);
            function clampColumn(col) { return Math.max(1, Math.min(columns - 2, col)); }
            function register(points, seed) {
                var route = { speed: 7 + seed % 5 * .6, period: 68 + seed % 4 * 13, offset: seed * 13.37, head: 0 };
                routes.push(route);
                points.forEach(function (point, step) {
                    var key = point.r * columns + point.c;
                    var cell = grid[key];
                    if (!cell) {
                        cell = grid[key] = { x: point.c * cellW, y: point.r * cellH, horizontal: false, vertical: false, links: [], fade: 1 };
                        if (!rows[point.r]) rows[point.r] = [];
                        rows[point.r].push(cell);
                    }
                    var before = points[step - 1], after = points[step + 1];
                    cell.horizontal = cell.horizontal || !!(before && before.c !== point.c) || !!(after && after.c !== point.c);
                    cell.vertical = cell.vertical || !!(before && before.r !== point.r) || !!(after && after.r !== point.r);
                    if (point.char) cell.special = point.char;
                    cell.links.push({ route: route, step: step % route.period });
                });
            }
            for (var lane = 0; lane < lanes; lane++) {
                var base = clampColumn(Math.round((lane + .5) * pitch));
                var col = base, points = [], positions = [];
                var reach = Math.max(1, Math.floor(pitch * .3));
                for (var row = 0; row < count; row++) {
                    points.push({ c: col, r: row });
                    if (row > 0 && (row + lane * 3) % (13 + lane % 3 * 2) === 0) {
                        var target = clampColumn(base + Math.round(Math.sin(row * .37 + lane * 2.17) * reach));
                        while (col !== target) {
                            col += col < target ? 1 : -1;
                            points.push({ c: col, r: row });
                        }
                    }
                    positions.push(col);
                }
                laneColumns.push(positions);
                register(points, lane + 1);
            }
            /* Small ASCII modules and cross-links turn the rails into a connected schematic. */
            for (var link = 0; link < lanes - 1; link++) {
                for (var line = 8 + link * 5 % 17; line < count; line += 29) {
                    var bridge = [];
                    var left = laneColumns[link][line], right = laneColumns[link + 1][line];
                    for (var column = left; column <= right; column++) bridge.push({ c: column, r: line });
                    if (bridge.length > 7) {
                        var middle = Math.floor(bridge.length / 2) - 2;
                        for (var mark = 0; mark < 4; mark++) bridge[middle + mark].char = '[01]'[mark];
                    }
                    register(bridge, line * lanes + link);
                }
            }

            var protectors = $$('.section-head, .about-copy, .code-card, .feature, .projects, .claims, .claims-foot, .contact-card, .footer-inner').map(function (el) {
                var box = el.getBoundingClientRect();
                return { left: box.left, right: box.right, top: box.top + scroll - contentTop, bottom: box.bottom + scroll - contentTop };
            });
            rows.forEach(function (row) {
                row.forEach(function (cell) {
                    var x = cell.x + cellW * .5, y = cell.y + cellH * .5;
                    var edge = w < 768 ? 18 : 56;
                    var fade = smooth(0, edge, x) * smooth(0, edge, w - x)
                        * smooth(0, 100, y) * smooth(0, 90, pageHeight - contentTop - y);
                    var distance = 110;
                    protectors.forEach(function (box) {
                        var dx = Math.max(box.left - x, x - box.right, 0);
                        var dy = Math.max(box.top - y, y - box.bottom, 0);
                        distance = Math.min(distance, Math.sqrt(dx * dx + dy * dy));
                    });
                    var quiet = w < 768 ? .32 : .18;
                    cell.fade = fade * (quiet + (1 - quiet) * smooth(0, 100, distance));
                    cell.glyph = chars.indexOf(cell.special || (cell.horizontal && cell.vertical ? '+' : cell.horizontal ? '-' : '|'));
                });
            });
        }

        function drawGlyph(index, tone, cell, y, alpha) {
            if (alpha < .002) return;
            ctx.globalAlpha = alpha;
            ctx.drawImage(atlas, index * sourceW, tone * sourceH, sourceW, sourceH, cell.x, y, cellW, cellH);
        }
        function render() {
            ctx.clearRect(0, 0, w, h);
            var start = Math.max(0, contentTop - scroll);
            if (!w || !h || start >= h) return;
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, start, w, h - start);
            ctx.clip();
            routes.forEach(function (route) { route.head = (time * route.speed + route.offset) % route.period; });
            var first = Math.max(0, Math.floor((scroll - contentTop) / cellH) - 1);
            var last = Math.min(rows.length - 1, Math.ceil((scroll + h - contentTop) / cellH));
            for (var r = first; r <= last; r++) {
                if (!rows[r]) continue;
                rows[r].forEach(function (cell) {
                    var signal = 0, spark = 0;
                    cell.links.forEach(function (link) {
                        var period = link.route.period;
                        var distance = (link.route.head - link.step + period) % period;
                        var signed = distance > period * .5 ? distance - period : distance;
                        var head = Math.exp(-signed * signed / 3.5);
                        var tail = Math.max(0, 1 - signed / 14);
                        signal = Math.max(signal, signed < 0 ? head : tail * tail);
                        spark = Math.max(spark, head);
                    });
                    var y = Math.round(cell.y + contentTop - scroll);
                    var alpha = cell.fade * opacity;
                    drawGlyph(cell.glyph, 0, cell, y, alpha * .24);
                    drawGlyph(cell.glyph, 1, cell, y, alpha * signal * .75);
                    drawGlyph(chars.indexOf('*'), 2, cell, y, alpha * spark * .72);
                });
            }
            ctx.restore();
            ctx.globalAlpha = 1;
        }

        function canAnimate() {
            return w > 0 && h > 0 && contentTop - scroll < h && !document.hidden && motionActive() && !print.matches;
        }
        function frame(now) {
            raf = 0;
            if (document.hidden || print.matches) { previous = 0; return; }
            var active = canAnimate();
            if (active && previous) time += Math.min(now - previous, 100) / 1000;
            previous = active ? now : 0;
            if (dirty || active && now - painted >= frameInterval) {
                render();
                dirty = false;
                painted = now - (now - painted) % frameInterval;
            }
            if (active) raf = requestAnimationFrame(frame);
        }
        function sync() {
            if (!canAnimate()) {
                cancelAnimationFrame(raf);
                raf = 0;
                previous = 0;
            }
            if (!document.hidden && !print.matches && !raf && (dirty || canAnimate())) raf = requestAnimationFrame(frame);
        }
        function refresh() { dirty = true; sync(); }
        function resize(force) {
            scroll = window.scrollY || 0;
            var width = window.innerWidth, height = window.innerHeight;
            if (!width || !height) return;
            var top = hero.getBoundingClientRect().bottom + scroll;
            var total = document.documentElement.scrollHeight;
            var ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(4000000 / (width * height)));
            if (!force && width === w && height === h && ratio === dpr && top === contentTop && total === pageHeight) return;
            if (width !== w || height !== h || ratio !== dpr) {
                canvas.width = Math.round(width * ratio);
                canvas.height = Math.round(height * ratio);
                ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
            }
            w = width; h = height; dpr = ratio; contentTop = top; pageHeight = total;
            cellW = w < 768 ? 10 : 12;
            cellH = w < 768 ? 16 : 18;
            buildAtlas();
            buildCircuit();
            render();
            dirty = false;
            sync();
        }

        window.addEventListener('scroll', function () { scroll = window.scrollY || 0; refresh(); }, { passive: true });
        window.addEventListener('resize', function () { resize(false); }, { passive: true });
        if ('ResizeObserver' in window) new ResizeObserver(function () { resize(false); }).observe(document.body);
        document.addEventListener('visibilitychange', refresh);
        if (print.addEventListener) print.addEventListener('change', refresh);
        else print.addListener(refresh);
        new MutationObserver(function (changes) {
            if (changes.some(function (change) { return change.attributeName === 'data-theme'; })) { buildAtlas(); render(); }
            refresh();
        }).observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-motion', 'data-overlay'] });
        if (document.fonts) document.fonts.ready.then(function () { resize(true); });
        resize(true);
    })();
})();
