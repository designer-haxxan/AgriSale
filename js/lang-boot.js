// Classic script loaded in <head> before first paint: applies language direction, the RTL Bootstrap build
// and the Urdu font so the page never flashes left-to-right English before switching.
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('pos.settings') || '{}');
    if (s.language !== 'ur') return;
    var h = document.documentElement;
    h.lang = 'ur'; h.dir = 'rtl';
    var bs = document.getElementById('bs-css');
    if (bs) bs.href = bs.href.replace('bootstrap.min.css', 'bootstrap.rtl.min.css');
    ['arabic-400', 'arabic-700'].forEach(function (w) {
      var l = document.createElement('link');
      l.rel = 'stylesheet';
      l.href = 'https://cdn.jsdelivr.net/npm/@fontsource/noto-nastaliq-urdu@5.2.8/' + w + '.css';
      document.head.appendChild(l);
    });
  } catch (e) { /* defaults to English / LTR */ }
})();
