(function () {
    var d = document.documentElement;
    d.classList.add('js');
    var saved, motion;
    try {
        saved = localStorage.getItem('ag-theme');
        motion = localStorage.getItem('ag-motion');
    } catch (e) {}
    if (saved === 'light' || saved === 'dark') d.setAttribute('data-theme', saved);
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    d.setAttribute('data-motion', motion === 'off' || (motion !== 'on' && reduced) ? 'off' : 'on');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', d.getAttribute('data-theme') === 'light' ? '#eae3d7' : '#07070a');
})();
