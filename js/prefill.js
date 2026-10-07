// Login prefill from a link like  https://app/#u=<username>&p=<password>  (both encodeURIComponent-encoded).
// Loaded as a classic script BEFORE the app module, so the credentials are removed from the address bar
// before the router reads location.hash. Values are only copied into the two login inputs (never stored,
// logged or sent anywhere) and the form is NOT submitted; the user presses Sign in.
(function () {
  var params = new URLSearchParams(location.hash.replace(/^#/, ''));
  var u = params.get('u'), p = params.get('p');
  params = null;
  if (u === null || p === null) return;
  history.replaceState(null, '', location.pathname + location.search);

  var tries = 0;
  (function fill() {
    var view = document.getElementById('view-login');
    var user = document.getElementById('login-username');
    var pass = document.getElementById('login-password');
    var btn = document.getElementById('login-btn');
    // The login screen only becomes visible when nobody is signed in; otherwise give up quietly.
    if (!view || !user || !pass || view.classList.contains('d-none')) {
      if (++tries < 100) setTimeout(fill, 100); else { u = p = null; }
      return;
    }
    user.value = u; pass.value = p;
    user.dispatchEvent(new Event('input', { bubbles: true }));
    pass.dispatchEvent(new Event('input', { bubbles: true }));
    u = p = null;
    var hint = document.getElementById('login-prefill-hint');
    if (hint) hint.classList.remove('d-none');
    if (btn) btn.classList.add('prefilled');
  })();
})();
