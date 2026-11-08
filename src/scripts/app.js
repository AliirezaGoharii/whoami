(function () {
    'use strict';

    var root = document.documentElement;
    var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    var $ = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var $$ = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
    function motionEnabled() { return root.getAttribute('data-motion') !== 'off'; }
    function effectsActive() { return motionEnabled() && !document.hidden && !root.hasAttribute('data-overlay'); }

    /* ---------- theme ---------- */
    var metaTheme = $('meta[name="theme-color"]');
    function setTheme(theme, persist) {
        root.setAttribute('data-theme', theme);
        if (metaTheme) metaTheme.setAttribute('content', theme === 'light' ? '#eae3d7' : '#07070a');
        $$('[data-theme-toggle]').forEach(function (btn) {
            var label = theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme';
            btn.setAttribute('aria-label', label);
            btn.setAttribute('title', label);
        });
        if (persist) { try { localStorage.setItem('ag-theme', theme); } catch (e) {} }
    }
    setTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark', false);
    $$('[data-theme-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            setTheme(root.getAttribute('data-theme') === 'light' ? 'dark' : 'light', true);
        });
    });

    /* ---------- motion preference: system default, explicit visitor override ---------- */
    var motionPreference = null;
    try { motionPreference = localStorage.getItem('ag-motion'); } catch (e) {}
    if (motionPreference !== 'on' && motionPreference !== 'off') motionPreference = null;
    function setMotion() {
        var on = motionPreference === null ? !motionQuery.matches : motionPreference === 'on';
        root.setAttribute('data-motion', on ? 'on' : 'off');
        $$('[data-motion-toggle]').forEach(function (btn) {
            btn.setAttribute('aria-pressed', on ? 'false' : 'true');
            btn.setAttribute('title', on ? 'Pause animations' : 'Resume animations');
            var label = $('[data-motion-label]', btn);
            if (label) label.textContent = on ? 'Motion on' : 'Motion paused';
        });
        if (!on) {
            $$('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
            $$('[data-count]').forEach(function (el) { el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || ''); });
            clearTimeout(roleTimer);
            if (rot) rot.classList.remove('swap');
        }
    }
    setMotion();
    $$('[data-motion-toggle]').forEach(function (btn) {
        btn.addEventListener('click', function () {
            motionPreference = motionEnabled() ? 'off' : 'on';
            try { localStorage.setItem('ag-motion', motionPreference); } catch (e) {}
            setMotion();
        });
    });
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', setMotion);
    else motionQuery.addListener(setMotion);
    window.addEventListener('storage', function (event) {
        if (event.key === 'ag-theme') setTheme(event.newValue === 'light' ? 'light' : 'dark', false);
        if (event.key === 'ag-motion') {
            motionPreference = event.newValue === 'on' || event.newValue === 'off' ? event.newValue : null;
            setMotion();
        }
    });

    /* ---------- year ---------- */
    var year = $('#year');
    if (year) year.textContent = new Date().getFullYear();

    /* ---------- hero role rotator ---------- */
    var rot = $('#rotator');
    var roleTimer;
    if (rot) {
        var phrases = ['Laravel & Vue.js Specialist', 'Inertia.js SPA Architect', 'Full-stack Product Builder', 'From Database to Pixel'];
        var ri = 0;
        setInterval(function () {
            if (!effectsActive() || !hero || hero.getBoundingClientRect().bottom <= 0) return;
            rot.classList.add('swap');
            roleTimer = setTimeout(function () {
                if (!effectsActive()) { rot.classList.remove('swap'); return; }
                ri = (ri + 1) % phrases.length;
                rot.textContent = phrases[ri];
                rot.classList.remove('swap');
            }, 300);
        }, 3400);
    }

    /* ---------- mobile menu ---------- */
    var menuBtn = $('#menuBtn');
    var menu = $('#mobileMenu');
    var lastFocus = null;
    var menuFocusTimer;
    var pageRegions = [$('main'), $('.site-footer')];
    function menuIsOpen() { return !!(menu && menu.classList.contains('open')); }
    function syncOverlay() {
        var overlay = menuIsOpen() ? 'menu' : preview && preview.open ? 'preview' : '';
        if (overlay) root.setAttribute('data-overlay', overlay);
        else root.removeAttribute('data-overlay');
    }
    function setMenu(open, restoreFocus) {
        if (!menu || !menuBtn || open === menuIsOpen()) return;
        clearTimeout(menuFocusTimer);
        menu.classList.toggle('open', open);
        menu.setAttribute('aria-hidden', open ? 'false' : 'true');
        menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        document.body.classList.toggle('menu-open', open);
        pageRegions.forEach(function (el) {
            if (!el) return;
            if (open) el.setAttribute('inert', '');
            else el.removeAttribute('inert');
        });
        if (open) {
            lastFocus = document.activeElement;
            var first = menu.querySelector('a, button');
            if (first) menuFocusTimer = setTimeout(function () { if (menuIsOpen()) first.focus(); }, 0);
        } else if (lastFocus) {
            if (restoreFocus !== false) lastFocus.focus({ preventScroll: true });
            lastFocus = null;
        }
        syncOverlay();
    }
    if (menuBtn && menu) {
        menuBtn.addEventListener('click', function () { setMenu(!menuIsOpen()); });
        $$('a', menu).concat($$('.brand, .nav-cta')).forEach(function (a) {
            a.addEventListener('click', function () {
                if (!menuIsOpen()) return;
                var href = a.getAttribute('href') || '';
                var target = href.charAt(0) === '#' ? document.getElementById(href.slice(1)) : null;
                setMenu(false, !target);
                if (target) target.focus({ preventScroll: true });
            });
        });
        window.addEventListener('resize', function () {
            if (menuIsOpen() && window.innerWidth > 1100) {
                setMenu(false, false);
                var first = $('.nav-links a');
                if (first) first.focus({ preventScroll: true });
            }
        }, { passive: true });
        document.addEventListener('keydown', function (e) {
            if (!menuIsOpen()) return;
            if (e.key === 'Escape') { e.preventDefault(); setMenu(false); return; }
            if (e.key !== 'Tab') return;
            var focusable = $$('#siteNav a[href], #siteNav button:not([disabled]), #mobileMenu a[href], #mobileMenu button:not([disabled])').filter(function (el) {
                return el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden';
            });
            if (!focusable.length) return;
            var first = focusable[0];
            var last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && (document.activeElement === last || focusable.indexOf(document.activeElement) === -1)) { e.preventDefault(); first.focus(); }
        });
    }

    /* ---------- native stack disclosure, with exclusive-open fallback ---------- */
    var layers = $$('.flow-node details');
    layers.forEach(function (layer) {
        layer.addEventListener('toggle', function () {
            if (layer.open) layers.forEach(function (other) { if (other !== layer) other.open = false; });
        });
    });

    /* ---------- full-size interface preview ---------- */
    var preview = $('#projectPreview');
    var previewTrigger = null;
    if (preview && typeof preview.showModal === 'function') {
        $$('[data-preview]').forEach(function (link) {
            link.setAttribute('aria-haspopup', 'dialog');
            link.setAttribute('aria-controls', preview.id);
            link.addEventListener('click', function (event) {
                if (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                if (preview.open) return;
                previewTrigger = link;
                var image = $('img', preview);
                if (image) image.loading = 'eager';
                preview.showModal();
                document.body.classList.add('preview-open');
                syncOverlay();
            });
        });
        $('[data-preview-close]', preview).addEventListener('click', function () { preview.close(); });
        preview.addEventListener('click', function (event) {
            var box = preview.getBoundingClientRect();
            if (event.target === preview && (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom)) preview.close();
        });
        preview.addEventListener('close', function () {
            document.body.classList.remove('preview-open');
            syncOverlay();
            if (previewTrigger) previewTrigger.focus({ preventScroll: true });
            previewTrigger = null;
        });
    }

    /* ---------- reveal on scroll ---------- */
    var reveals = $$('.reveal');
    if ('IntersectionObserver' in window && motionEnabled()) {
        var revealObs = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-visible');
                revealObs.unobserve(entry.target);
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -6% 0px' });
        reveals.forEach(function (el) { revealObs.observe(el); });
    } else {
        reveals.forEach(function (el) { el.classList.add('is-visible'); });
    }

    /* ---------- animated counters ---------- */
    var counters = $$('[data-count]');
    if (counters.length) {
        if (!motionEnabled() || !('IntersectionObserver' in window)) {
            counters.forEach(function (el) { el.textContent = el.getAttribute('data-count') + (el.getAttribute('data-suffix') || ''); });
        } else {
            var countObs = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    var el = entry.target;
                    countObs.unobserve(el);
                    var target = parseFloat(el.getAttribute('data-count')) || 0;
                    var suffix = el.getAttribute('data-suffix') || '';
                    var start = 0;
                    var duration = 1100;
                    function tick(now) {
                        if (!effectsActive()) { el.textContent = target + suffix; return; }
                        if (!start) start = now;
                        var p = Math.min((now - start) / duration, 1);
                        var eased = 1 - Math.pow(1 - p, 3);
                        el.textContent = Math.round(target * eased) + suffix;
                        if (p < 1) requestAnimationFrame(tick);
                    }
                    requestAnimationFrame(tick);
                });
            }, { threshold: 0.6 });
            counters.forEach(function (el) { countObs.observe(el); });
        }
    }

    /* ---------- card spotlight ---------- */
    if (window.matchMedia('(hover: hover)').matches) {
        $$('.spot').forEach(function (el) {
            el.addEventListener('pointermove', function (e) {
                if (!effectsActive() || e.pointerType && e.pointerType !== 'mouse') return;
                var rect = el.getBoundingClientRect();
                el.style.setProperty('--mx', (e.clientX - rect.left) + 'px');
                el.style.setProperty('--my', (e.clientY - rect.top) + 'px');
            });
        });
    }

    /* ---------- scroll UI ---------- */
    var progress = $('#scrollProgress');
    var nav = $('#siteNav');
    var hero = document.getElementById('top');
    var toTop = $('#toTop');
    var ring = $('#ringFill');
    var links = $$('[data-link]');
    var sections = ['about', 'work', 'standard', 'contact'].map(function (id) { return document.getElementById(id); }).filter(Boolean);
    var ticking = false;

    function updateScroll() {
        var y = Math.max(0, window.scrollY || window.pageYOffset || 0);
        if (nav) {
            nav.classList.toggle('is-scrolled', y > 24);
            nav.classList.toggle('has-brand', !hero || hero.getBoundingClientRect().bottom <= nav.offsetHeight + 16);
        }
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var p = max > 0 ? Math.min(y / max, 1) : 0;
        if (progress) progress.style.transform = 'scaleX(' + p.toFixed(4) + ')';
        if (toTop) toTop.classList.toggle('show', y > window.innerHeight * 0.55);
        if (ring) ring.style.strokeDashoffset = (145 * (1 - p)).toFixed(1);
        var current = '';
        sections.forEach(function (section) {
            if (section.getBoundingClientRect().top <= window.innerHeight * 0.4) current = section.id;
        });
        if (max > 0 && max - y < 4 && sections.length) current = sections[sections.length - 1].id;
        links.forEach(function (a) {
            var on = a.getAttribute('data-link') === current;
            a.classList.toggle('active', on);
            if (on) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
        });
        ticking = false;
    }
    function onScroll() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(updateScroll);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateScroll();

    if (toTop) {
        toTop.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: motionEnabled() ? 'smooth' : 'auto' });
            if (hero) hero.focus({ preventScroll: true });
        });
    }

    /* ---------- copy email ---------- */
    var toast = $('#toast');
    var toastTimer;
    function showToast(message, failed) {
        if (!toast) return;
        toast.querySelector('span').textContent = message;
        var icon = $('use', toast);
        if (icon) icon.setAttribute('href', failed ? '#i-close' : '#i-check');
        toast.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toast.classList.remove('show'); }, 2400);
    }
    function fallbackCopy(text) {
        var focus = document.activeElement;
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '-1000px';
        document.body.appendChild(ta);
        var copied = false;
        try { ta.select(); copied = document.execCommand('copy') === true; } catch (e) {}
        finally {
            document.body.removeChild(ta);
            if (focus) focus.focus({ preventScroll: true });
        }
        return copied;
    }
    $$('[data-copy]').forEach(function (btn) {
        var label = $('[data-copy-label]', btn);
        var original = label ? label.textContent : '';
        var resetTimer, request = 0;
        btn.addEventListener('click', function () {
            var text = btn.getAttribute('data-copy') || '';
            var current = ++request;
            function done(copied) {
                if (current !== request) return;
                clearTimeout(resetTimer);
                if (label) label.textContent = copied ? 'Copied to clipboard' : original;
                btn.classList.toggle('copied', copied);
                showToast(copied ? 'Email copied to clipboard' : 'Copy unavailable — use the email link above.', !copied);
                resetTimer = setTimeout(function () {
                    btn.classList.remove('copied');
                    if (label) label.textContent = original;
                }, 2200);
            }
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(text).then(function () { done(true); }).catch(function () { done(fallbackCopy(text)); });
            } else {
                done(fallbackCopy(text));
            }
        });
    });
})();
