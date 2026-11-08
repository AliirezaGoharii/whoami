const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rootPath = path.resolve(__dirname, '..');

function fixture({ reduced = false, stored = {}, blocked = false, clipboard, copyResult = true, bootstrap = false, dialog = true } = {}) {
    const selectors = new Map(), ids = new Map(), timers = new Map(), frames = new Map();
    const saved = new Map(Object.entries(stored));
    let doc, serial = 0;
    function element(id = '', attrs = {}) {
        const attributes = new Map(Object.entries(attrs)), classes = new Set();
        const node = {
            id, style: {}, textContent: '', listeners: {}, queries: new Map(), children: [], visible: true,
            classList: {
                add(...names) { names.forEach(n => classes.add(n)); },
                remove(...names) { names.forEach(n => classes.delete(n)); },
                contains(name) { return classes.has(name); },
                toggle(name, on) { on = on === undefined ? !classes.has(name) : on; on ? classes.add(name) : classes.delete(name); return on; }
            },
            setAttribute(name, value) { attributes.set(name, String(value)); },
            getAttribute(name) { return attributes.get(name) ?? null; },
            hasAttribute(name) { return attributes.has(name); },
            removeAttribute(name) { attributes.delete(name); },
            addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
            emit(name, values = {}) {
                const event = { target: this, button: 0, prevented: false, preventDefault() { this.prevented = true; }, ...values };
                for (const fn of this.listeners[name] || []) fn(event);
                return event;
            },
            querySelectorAll(query) { return this.queries.get(query) || []; },
            querySelector(query) { return this.querySelectorAll(query)[0] || null; },
            getClientRects() { return this.visible ? [this.getBoundingClientRect()] : []; },
            getBoundingClientRect() { return { top: 0, bottom: 44, left: 0, right: 44, width: 44, height: 44 }; },
            focus() { doc.activeElement = this; },
            select() { this.focus(); },
            appendChild(child) { this.children.push(child); },
            removeChild(child) { this.children.splice(this.children.indexOf(child), 1); }
        };
        if (id) ids.set(id, node);
        return node;
    }
    const html = element('html', { 'data-theme': 'dark', 'data-motion': 'on' });
    html.scrollHeight = 4500;
    doc = Object.assign(element(), {
        documentElement: html, body: element('body'), activeElement: null, hidden: false,
        querySelectorAll(query) { return selectors.get(query) || []; },
        querySelector(query) { return this.querySelectorAll(query)[0] || null; },
        getElementById(id) { return ids.get(id) || null; },
        createElement() { return element(); },
        execCommand(command) { assert.equal(command, 'copy'); return copyResult; }
    });
    const motion = Object.assign(element(), { matches: reduced });
    const win = Object.assign(element(), {
        innerWidth: 390, innerHeight: 800, scrollY: 0, pageYOffset: 0,
        matchMedia(query) { return query.includes('prefers-reduced-motion') ? motion : { matches: false }; },
        scrollTo(options) { this.lastScroll = options; this.scrollY = options.top; }
    });
    const bind = (query, ...nodes) => { selectors.set(query, nodes); return nodes[0]; };
    const theme = bind('[data-theme-toggle]', element('theme'));
    const motionButton = bind('[data-motion-toggle]', element('motion'));
    const motionLabel = element(); motionButton.queries.set('[data-motion-label]', [motionLabel]);
    const meta = bind('meta[name="theme-color"]', element('meta'));
    const reveal = bind('.reveal', element('reveal'));
    const count = bind('[data-count]', element('count', { 'data-count': '2' }));
    bind('#year', element('year')); bind('#rotator', element('rotator'));
    const menuButton = bind('#menuBtn', element('menuBtn'));
    const menu = bind('#mobileMenu', element('mobileMenu'));
    const main = bind('main', element('main'));
    const footer = bind('.site-footer', element('footer'));
    const nav = bind('#siteNav', element('siteNav')); nav.offsetHeight = 80;
    const hero = element('top'); hero.getBoundingClientRect = () => ({ bottom: 900 - win.scrollY, top: -win.scrollY });
    const sections = ['about', 'work', 'standard', 'contact'].map((id, i) => {
        const node = element(id); node.getBoundingClientRect = () => ({ top: 1000 + i * 950 - win.scrollY }); return node;
    });
    const brand = element('brand', { href: '#top' });
    const cta = element('cta', { href: '#contact' }); cta.visible = false;
    bind('.brand, .nav-cta', brand, cta);
    const primary = bind('.nav-links a', element('primary')); primary.visible = false;
    const firstMenu = element('firstMenu', { href: '#about', 'data-link': 'about' });
    const lastMenu = element('lastMenu', { href: 'mailto:aliirezagoharii@gmail.com' });
    menu.queries.set('a', [firstMenu, lastMenu]); menu.queries.set('a, button', [firstMenu]);
    bind('#siteNav a[href], #siteNav button:not([disabled]), #mobileMenu a[href], #mobileMenu button:not([disabled])', brand, primary, theme, cta, menuButton, firstMenu, lastMenu);
    bind('[data-link]', firstMenu); bind('#scrollProgress', element()); bind('#ringFill', element());
    const toTop = bind('#toTop', element('toTop'));
    const preview = bind('#projectPreview', element('projectPreview'));
    preview.open = false;
    const previewClose = element('previewClose'), image = element();
    preview.queries.set('[data-preview-close]', [previewClose]); preview.queries.set('img', [image]);
    if (dialog) preview.showModal = () => { preview.open = true; previewClose.focus(); };
    preview.close = () => { preview.open = false; preview.emit('close'); };
    const previewLink = bind('[data-preview]', element('previewLink'));
    const toast = bind('#toast', element('toast')), message = element(), toastIcon = element();
    toast.queries.set('span', [message]); toast.queries.set('use', [toastIcon]);
    const copy = bind('[data-copy]', element('copy', { 'data-copy': 'aliirezagoharii@gmail.com' }));
    const copyLabel = element(); copyLabel.textContent = 'Copy email address'; copy.queries.set('[data-copy-label]', [copyLabel]);
    const storage = {
        getItem(key) { if (blocked) throw Error('Storage blocked'); return saved.get(key) ?? null; },
        setItem(key, value) { if (blocked) throw Error('Storage blocked'); saved.set(key, value); }
    };
    const sandbox = {
        document: doc, window: win, navigator: clipboard ? { clipboard: { writeText: clipboard } } : {}, localStorage: storage,
        getComputedStyle(node) { return { visibility: node === brand && !nav.classList.contains('has-brand') ? 'hidden' : 'visible' }; },
        setTimeout(fn, delay) { timers.set(++serial, { fn, delay }); return serial; }, clearTimeout(id) { timers.delete(id); }, setInterval() {},
        requestAnimationFrame(fn) { frames.set(++serial, fn); return serial; }
    };
    vm.runInNewContext(fs.readFileSync(path.join(rootPath, `src/scripts/${bootstrap ? 'bootstrap' : 'app'}.js`), 'utf8'), sandbox);
    function runTimers(maximum = Infinity) {
        for (const [id, timer] of [...timers]) if (timer.delay <= maximum) { timers.delete(id); timer.fn(); }
    }
    function scrollTo(y) { win.scrollY = y; win.emit('scroll'); const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(1000)); }
    return { html, doc, win, motion, saved, theme, motionButton, motionLabel, meta, reveal, count, menuButton, menu, main, footer, nav, hero, sections, firstMenu, lastMenu, primary, preview, previewClose, previewLink, toTop, copy, copyLabel, message, toastIcon, runTimers, scrollTo };
}
const microtasks = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

test('bootstrap respects reduced motion even with blocked storage', () => {
    const f = fixture({ bootstrap: true, blocked: true, reduced: true });
    assert.equal(f.html.getAttribute('data-motion'), 'off');
    assert.equal(f.meta.getAttribute('content'), '#07070a');
    assert.ok(f.html.classList.contains('js'));
});

test('motion preference persists, tracks system defaults, and supports explicit override', () => {
    const f = fixture({ reduced: true });
    assert.equal(f.motionButton.getAttribute('aria-pressed'), 'true');
    assert.equal(f.count.textContent, '2');
    f.motionButton.emit('click');
    assert.equal(f.html.getAttribute('data-motion'), 'on');
    assert.equal(f.saved.get('ag-motion'), 'on');
    f.motion.emit('change');
    assert.equal(f.html.getAttribute('data-motion'), 'on');
    f.win.emit('storage', { key: 'ag-motion', newValue: 'off' });
    assert.equal(f.motionLabel.textContent, 'Motion paused');
    f.toTop.emit('click');
    assert.equal(f.win.lastScroll.behavior, 'auto');
});

test('navbar brand waits until the hero passes the navbar', () => {
    const f = fixture();
    f.scrollTo(420);
    assert.ok(f.nav.classList.contains('is-scrolled'));
    assert.equal(f.nav.classList.contains('has-brand'), false);
    f.scrollTo(850); assert.ok(f.nav.classList.contains('has-brand'));
    f.scrollTo(0); assert.equal(f.nav.classList.contains('has-brand'), false);
});

test('mobile focus loop includes the close button and restores focus on Escape', () => {
    const f = fixture();
    f.menuButton.focus(); f.menuButton.emit('click'); f.runTimers(0);
    assert.equal(f.doc.activeElement, f.firstMenu);
    assert.ok(f.main.hasAttribute('inert') && f.footer.hasAttribute('inert'));
    assert.equal(f.html.getAttribute('data-overlay'), 'menu');
    assert.equal(f.doc.emit('keydown', { key: 'Tab', shiftKey: true }).prevented, false, 'Shift-Tab must be able to reach the close button');
    f.lastMenu.focus(); f.doc.emit('keydown', { key: 'Tab' }); assert.equal(f.doc.activeElement, f.theme);
    f.doc.emit('keydown', { key: 'Tab', shiftKey: true }); assert.equal(f.doc.activeElement, f.lastMenu);
    f.doc.emit('keydown', { key: 'Escape' });
    assert.equal(f.doc.activeElement, f.menuButton);
    assert.equal(f.main.hasAttribute('inert'), false);
    assert.equal(f.html.hasAttribute('data-overlay'), false);
});

test('mobile navigation focuses its destination and cancels stale opening focus', () => {
    const f = fixture();
    f.menuButton.focus(); f.menuButton.emit('click'); f.firstMenu.emit('click'); f.runTimers(0);
    assert.equal(f.doc.activeElement, f.sections[0]);
    assert.equal(f.menuButton.getAttribute('aria-expanded'), 'false');
    f.menuButton.emit('click'); f.runTimers(0);
    f.win.innerWidth = 1280; f.primary.visible = true; f.win.emit('resize');
    assert.equal(f.doc.activeElement, f.primary);
});

test('interface preview pauses the background and restores the trigger on close', () => {
    const f = fixture();
    assert.equal(f.previewLink.emit('click', { ctrlKey: true }).prevented, false);
    assert.equal(f.preview.open, false);
    assert.equal(f.previewLink.emit('click').prevented, true);
    assert.equal(f.html.getAttribute('data-overlay'), 'preview');
    assert.equal(f.doc.activeElement, f.previewClose);
    f.previewClose.emit('click');
    assert.equal(f.preview.open, false);
    assert.equal(f.html.hasAttribute('data-overlay'), false);
    assert.equal(f.doc.activeElement, f.previewLink);
    const fallback = fixture({ dialog: false });
    assert.equal(fallback.previewLink.emit('click').prevented, false);
});

test('failed clipboard permission and fallback never report a successful copy', async () => {
    const f = fixture({ clipboard: () => Promise.reject(Error('Denied')), copyResult: false });
    f.copy.focus(); f.copy.emit('click'); await microtasks();
    assert.equal(f.copy.classList.contains('copied'), false);
    assert.equal(f.copyLabel.textContent, 'Copy email address');
    assert.match(f.message.textContent, /Copy unavailable/);
    assert.equal(f.toastIcon.getAttribute('href'), '#i-close');
    assert.equal(f.doc.activeElement, f.copy);
    assert.equal(f.doc.body.children.length, 0);
});

test('repeated successful copies always restore the original button label', async () => {
    const f = fixture({ clipboard: () => Promise.resolve() });
    f.copy.emit('click'); await microtasks();
    f.copy.emit('click'); await microtasks();
    assert.equal(f.copyLabel.textContent, 'Copied to clipboard');
    f.runTimers();
    assert.equal(f.copyLabel.textContent, 'Copy email address');
    assert.equal(f.copy.classList.contains('copied'), false);
    const fallback = fixture({ copyResult: true });
    fallback.copy.emit('click'); assert.equal(fallback.copy.classList.contains('copied'), true);
});

test('a stale clipboard completion cannot overwrite the latest result', async () => {
    const pending = [];
    const f = fixture({ clipboard: () => new Promise((resolve, reject) => pending.push({ resolve, reject })), copyResult: false });
    f.copy.emit('click'); f.copy.emit('click');
    pending[1].reject(Error('Denied')); await microtasks();
    pending[0].resolve(); await microtasks();
    assert.equal(f.copy.classList.contains('copied'), false);
    assert.match(f.message.textContent, /Copy unavailable/);
});
