const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rootPath = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootPath, 'src/scripts/ascii.js'), 'utf8');
const css = fs.readFileSync(path.join(rootPath, 'src/styles.css'), 'utf8');
function tokens(selector) {
    const block = css.slice(css.indexOf(selector) + selector.length).split('\n}')[0];
    return Object.fromEntries([...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]]));
}
const dark = tokens(':root {'), light = { ...dark, ...tokens(':root[data-theme="light"] {') };

function fixture({ width = 1440, height = 900, heroHeight = 900, dpr = 2, motion = 'on', context = true, protect = true } = {}) {
    const queue = new Map(), observers = [], intersections = [], resizes = [], fontsReady = [];
    const state = { width, height, heroHeight, scroll: 0, total: 5400 };
    let serial = 0;
    const events = () => ({ listeners: {}, addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }, emit(name) { (this.listeners[name] || []).forEach(fn => fn()); } });
    const attributes = new Map([['data-motion', motion], ['data-theme', 'dark']]);
    const root = {
        get scrollHeight() { return state.total; },
        getAttribute(name) { return attributes.get(name) ?? null; }, hasAttribute(name) { return attributes.has(name); },
        setAttribute(name, value) { attributes.set(name, value); observers.filter(o => o.options.attributeFilter.includes(name)).forEach(o => o.fn([{ attributeName: name }])); },
        removeAttribute(name) { attributes.delete(name); observers.filter(o => o.options.attributeFilter.includes(name)).forEach(o => o.fn([{ attributeName: name }])); }
    };
    function canvas(name) {
        let width = 0, height = 0;
        const image = { name, records: new Map(), points: [], paints: 0, resets: 0, clipTop: 0 };
        const key = (x, y) => `${x.toFixed(4)},${y.toFixed(4)}`;
        const ctx = {
            globalAlpha: 1, globalCompositeOperation: 'source-over', sx: 1, sy: 1,
            setTransform(x, b, c, y) { this.sx = x; this.sy = y; },
            fillText(char, x, y) { image.records.set(key(x * this.sx, y * this.sy), { char, color: this.fillStyle }); },
            clearRect() { image.points = []; image.paints++; image.clipTop = 0; },
            createLinearGradient() { return { stops: [], addColorStop(at, color) { this.stops.push([at, color]); } }; },
            fillRect() { image.palette = this.fillStyle; },
            save() {}, restore() {}, beginPath() {}, rect(x, y) { image.clipTop = y; }, clip() {},
            drawImage(atlas, x, y, w, h, dx, dy, dw, dh) {
                const record = atlas.records.get(key(x + w * .5, y + h * .5));
                assert.ok(record && /^[\x20-\x7e]$/.test(record.char), 'Only valid cached ASCII glyphs may be drawn');
                assert.ok(Number.isFinite(this.globalAlpha) && this.globalAlpha >= 0 && this.globalAlpha <= 1);
                image.points.push([record.char, dx, dy, this.globalAlpha, record.color, dw, dh]);
            }
        };
        Object.defineProperties(image, {
            width: { get: () => width, set(v) { width = v; image.resets++; image.records.clear(); } },
            height: { get: () => height, set(v) { height = v; image.resets++; } }
        });
        image.getContext = () => context || name === 'atlas' ? ctx : null;
        return image;
    }
    const heroCanvas = canvas('hero'), pageCanvas = canvas('page');
    const copy = { getBoundingClientRect: () => ({ left: state.width < 768 ? 18 : 130, right: state.width < 768 ? state.width - 18 : 760, top: 150 - state.scroll, bottom: 700 - state.scroll }) };
    const hero = {
        querySelector: () => copy,
        getBoundingClientRect: () => ({ width: state.width, height: state.heroHeight, left: 0, top: -state.scroll, bottom: state.heroHeight - state.scroll })
    };
    const doc = Object.assign(events(), {
        hidden: false, documentElement: root, body: {}, fonts: { ready: { then(fn) { fontsReady.push(fn); } } },
        querySelector(sel) { return { '#heroAscii': heroCanvas, '#pageAscii': pageCanvas, '#top': hero }[sel]; },
        querySelectorAll() { return protect ? [{ getBoundingClientRect: () => ({ left: 50, right: state.width - 50, top: state.heroHeight + 100 - state.scroll, bottom: state.heroHeight + 720 - state.scroll }) }] : []; },
        createElement() { return canvas('atlas'); }
    });
    const print = Object.assign(events(), { matches: false });
    const win = Object.assign(events(), { devicePixelRatio: dpr, matchMedia: () => print });
    Object.defineProperties(win, { innerWidth: { get: () => state.width }, innerHeight: { get: () => state.height }, scrollY: { get: () => state.scroll } });
    const makeObserver = list => class { constructor(fn) { this.fn = fn; list.push(this); } observe(target, options) { this.target = target; this.options = options; } };
    const IO = makeObserver(intersections), RO = makeObserver(resizes), MO = makeObserver(observers);
    win.IntersectionObserver = IO; win.ResizeObserver = RO;
    vm.runInNewContext(source, {
        document: doc, window: win, IntersectionObserver: IO, ResizeObserver: RO, MutationObserver: MO,
        getComputedStyle: () => ({ getPropertyValue: name => (root.getAttribute('data-theme') === 'light' ? light : dark)[name] }),
        requestAnimationFrame(fn) { queue.set(++serial, fn); return serial; }, cancelAnimationFrame(id) { queue.delete(id); }
    });
    function frame(now) { const pending = [...queue.values()]; queue.clear(); pending.forEach(fn => fn(now)); assert.ok(queue.size <= 2, 'At most one animation loop per scene'); }
    function scrollTo(y, now = 1000) {
        state.scroll = y; win.emit('scroll');
        intersections.forEach(o => o.fn([{ isIntersecting: state.heroHeight - y > 0 && -y < state.height }]));
        frame(now);
    }
    return { state, root, doc, win, print, queue, heroCanvas, pageCanvas, frame, scrollTo, resizes, fontsReady };
}

test('ASCII scenes animate only in their intended page regions', () => {
    const f = fixture();
    assert.ok(f.heroCanvas.points.length > 1000);
    assert.equal(f.pageCanvas.points.length, 0);
    assert.equal(f.queue.size, 1);
    const first = JSON.stringify(f.heroCanvas.points), paints = f.heroCanvas.paints, resets = f.heroCanvas.resets;
    for (let i = 0; i < 120; i++) f.frame(1000 + i * 1000 / 60);
    assert.notEqual(JSON.stringify(f.heroCanvas.points), first);
    assert.ok(f.heroCanvas.paints - paints <= 62);
    assert.equal(f.heroCanvas.resets, resets);
    f.scrollTo(450, 4000); assert.equal(f.pageCanvas.clipTop, 450);
    f.scrollTo(1000, 4100);
    const heroPaints = f.heroCanvas.paints, circuit = JSON.stringify(f.pageCanvas.points);
    for (let i = 0; i < 60; i++) f.frame(4200 + i * 1000 / 60);
    assert.equal(f.heroCanvas.paints, heroPaints);
    assert.notEqual(JSON.stringify(f.pageCanvas.points), circuit);
    f.scrollTo(0, 6000); assert.equal(f.pageCanvas.points.length, 0);
});

test('motion controls, overlays, hidden tabs and print all pause and resume cleanly', () => {
    const f = fixture();
    f.root.setAttribute('data-motion', 'off'); f.frame(1000); assert.equal(f.queue.size, 0);
    assert.ok(f.heroCanvas.points.length > 1000, 'Paused art must retain a static frame');
    f.root.setAttribute('data-motion', 'on'); f.frame(1050); assert.equal(f.queue.size, 1);
    f.root.setAttribute('data-overlay', 'preview'); f.frame(1100); assert.equal(f.queue.size, 0);
    f.root.removeAttribute('data-overlay'); f.frame(1150); assert.equal(f.queue.size, 1);
    f.doc.hidden = true; f.doc.emit('visibilitychange'); assert.equal(f.queue.size, 0);
    f.doc.hidden = false; f.doc.emit('visibilitychange'); f.frame(1200); assert.equal(f.queue.size, 1);
    f.print.matches = true; f.print.emit('change'); assert.equal(f.queue.size, 0);
    f.print.matches = false; f.print.emit('change'); f.frame(1250); assert.equal(f.queue.size, 1);
});

test('static circuit scrolling stays aligned with the document and protects reading areas', () => {
    const f = fixture({ motion: 'off' }); f.scrollTo(1000);
    const positions = new Map(f.pageCanvas.points.filter(p => p[2] > 100 && p[2] < 600).map(p => [[p[0], p[1], p[2] + 1000, p[4]].join(','), p[3]]));
    f.scrollTo(1048, 1100);
    let matches = 0;
    for (const p of f.pageCanvas.points) {
        const key = [p[0], p[1], p[2] + 1048, p[4]].join(',');
        if (positions.has(key)) { assert.equal(p[3], positions.get(key)); matches++; }
    }
    assert.ok(matches > 100); assert.equal(f.queue.size, 0);
    const unmasked = fixture({ motion: 'off', protect: false }); unmasked.scrollTo(1048, 1100);
    assert.ok(f.pageCanvas.points.reduce((n, p) => n + p[3], 0) < unmasked.pageCanvas.points.reduce((n, p) => n + p[3], 0) * .7);
});

test('themes update paused artwork; resize and font readiness never duplicate loops', () => {
    const f = fixture({ motion: 'off' }); f.scrollTo(1000);
    f.root.setAttribute('data-theme', 'light'); f.frame(1100);
    assert.equal(f.heroCanvas.palette.stops[1][1], light['--ascii-accent']);
    assert.ok(f.pageCanvas.points.some(p => p[4] === light['--circuit-accent']));
    const allocated = f.pageCanvas.resets;
    f.state.total += 600; f.resizes.forEach(o => o.fn());
    assert.equal(f.pageCanvas.resets, allocated, 'A longer page must not allocate a taller canvas');
    f.state.width = 390; f.state.height = 844; f.state.heroHeight = 1280; f.win.devicePixelRatio = 3;
    f.win.emit('resize'); f.fontsReady.forEach(fn => fn()); f.frame(1200);
    assert.equal(f.queue.size, 0);
    assert.ok(f.heroCanvas.width * f.heroCanvas.height < 4005000);
    assert.ok(f.pageCanvas.width * f.pageCanvas.height < 4005000);
    f.root.setAttribute('data-motion', 'on'); f.frame(1300); assert.ok(f.queue.size <= 2);
});

test('large screens use bounded backing stores and missing canvas contexts fail gracefully', () => {
    const f = fixture({ width: 3840, height: 2160, heroHeight: 2160, dpr: 3 });
    assert.ok(f.heroCanvas.width * f.heroCanvas.height < 4005000);
    assert.ok(f.pageCanvas.width * f.pageCanvas.height < 4005000);
    assert.equal(fixture({ context: false }).queue.size, 0);
});
