/* Check for update, version number and What's new.
   The same file is used in each of Gluminou's apps; keep the copies identical.

   The page defines, before loading this file:
     const APP_RELEASE="1.2.0";          version people see
     const APP_DATE="2026-11-21";        day that version was pushed (Hong Kong date)
     const APP_VERSION="202611211200";   build stamp, equal to "v" in version.json
   Optional: <div id="app-updates"></div> where the section goes; without it the
   section is added at the end of the page.
   Files next to the page: version.json {v, version, date, notes} and
   changelog.json [{version, date, notes}], both written by tools/release.mjs.

   A freshly opened app loads a newer build straight away (once per build, so a
   stale cache can't loop). An app that is already open shows an Update bar. */
(function () {
  if (window.__appUpdates) return; window.__appUpdates = true;
  var fr = /^fr/i.test(document.documentElement.lang || '');
  var T = fr ? {
    version: 'version', check: 'Rechercher une mise à jour', update: 'Mettre à jour',
    checking: 'Recherche…', latest: 'Vous avez la dernière version.', error: 'Impossible de vérifier. Réessayez une fois en ligne.',
    updating: 'Mise à jour…', ready: function (v) { return v ? 'La version ' + v + ' est prête' : 'Une mise à jour est prête'; },
    news: 'Nouveautés', loading: 'Chargement…', logError: 'Liste indisponible. Vérifiez la connexion.', locale: 'fr-FR'
  } : {
    version: 'version', check: 'Check for update', update: 'Update now',
    checking: 'Checking…', latest: 'You have the latest version.', error: "Couldn't check. Try again when you're online.",
    updating: 'Updating…', ready: function (v) { return v ? 'Version ' + v + ' is ready' : 'An update is ready'; },
    news: "What's new", loading: 'Loading…', logError: "Couldn't load the list. Check the connection.", locale: 'en-GB'
  };
  var REL = typeof APP_RELEASE !== 'undefined' ? APP_RELEASE : '';
  var DATE = typeof APP_DATE !== 'undefined' ? APP_DATE : '';
  var BUILD = String(typeof APP_VERSION !== 'undefined' ? APP_VERSION : '');
  var NAME = (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || document.title;
  var U = { state: 'idle', latest: null, log: null, open: false };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var fmt = function (s) { var d = new Date(s + 'T00:00'); return isNaN(d) ? (s || '') : d.toLocaleDateString(T.locale, { day: 'numeric', month: 'short', year: 'numeric' }); };

  var css = '.au{max-width:720px;margin:0 auto;padding:18px 16px 28px;display:grid;gap:10px;justify-items:center;text-align:center;font:inherit;font-size:14px;color:inherit}' +
    '.au .au-v{opacity:.75;font-variant-numeric:tabular-nums}.au .au-v b{opacity:1;font-weight:700}' +
    '.au-btn{font:inherit;font-weight:700;font-size:14px;border-radius:10px;padding:9px 16px;cursor:pointer;min-width:200px;border:1px solid var(--au-accent,#0f6b5c);background:transparent;color:var(--au-accent,#0f6b5c)}' +
    '.au-btn.au-go{background:var(--au-accent,#0f6b5c);color:#fff}.au-btn:disabled{opacity:.55;cursor:default}' +
    '.au-btn:focus-visible,.au summary:focus-visible{outline:2px solid var(--au-accent,#0f6b5c);outline-offset:2px}' +
    '.au-msg{opacity:.75;min-height:1em}.au ul{margin:0;padding-left:18px;text-align:left}' +
    '.au details{width:100%;text-align:left;border:1px solid rgba(127,127,127,.3);border-radius:12px;padding:10px 14px}' +
    '.au summary{cursor:pointer;font-weight:700}' +
    '.au-rel{padding:10px 0 4px;border-bottom:1px solid rgba(127,127,127,.25)}.au-rel:last-child{border-bottom:0}' +
    '.au-rel h4{margin:0 0 2px;font-size:14px;font-variant-numeric:tabular-nums}.au-rel h4 span{font-weight:400;opacity:.7}' +
    '.au-bar{position:fixed;left:12px;right:12px;bottom:calc(var(--au-bar-bottom,16px) + env(safe-area-inset-bottom,0px));z-index:2147483000;max-width:520px;margin:0 auto;display:none;align-items:center;gap:10px;padding:10px 12px 10px 16px;border-radius:14px;background:#15302a;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.2);font-size:14.5px}' +
    '.au-bar[data-show="true"]{display:flex}.au-bar span{flex:1}.au-bar button{font:inherit;font-weight:700;border:0;border-radius:10px;padding:8px 14px;background:#fff;color:#15302a;cursor:pointer}';

  var host, bar;
  function mount() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    host = document.getElementById('app-updates');
    if (!host) { host = document.createElement('footer'); host.id = 'app-updates'; document.body.appendChild(host); }
    host.classList.add('au');
    bar = document.createElement('div'); bar.className = 'au-bar'; bar.setAttribute('role', 'status');
    bar.innerHTML = '<span></span><button type="button">' + esc(T.update) + '</button>';
    document.body.appendChild(bar);
    bar.querySelector('button').addEventListener('click', apply);
    host.addEventListener('click', function (e) {
      if (e.target.closest('.au-btn')) { U.state === 'available' ? apply() : check('manual'); }
    });
    host.addEventListener('toggle', function (e) { if (e.target.tagName === 'DETAILS') { U.open = e.target.open; if (U.open && !U.log) loadLog(); } }, true);
    render();
  }
  function newVer() { var L = U.latest; return L && L.version && L.version !== REL ? L.version : ''; }
  function render() {
    if (!host) return;
    var d = host.querySelector('details'); if (d && d.open) U.open = true;
    var L = U.latest, avail = U.state === 'available' || U.state === 'updating';
    var msg = { checking: T.checking, latest: T.latest, error: T.error, updating: T.updating }[U.state] || '';
    var notes = avail && newVer() && L.notes && L.notes.length ? '<ul>' + L.notes.map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul>' : '';
    host.innerHTML =
      '<div class="au-v"><b>' + esc(NAME) + '</b> ' + T.version + ' ' + esc(REL || BUILD) + (DATE ? ' · ' + esc(fmt(DATE)) : '') + '</div>' +
      (avail ? '<div><b>' + esc(T.ready(newVer())) + '</b></div>' + notes : '') +
      '<button type="button" class="au-btn' + (avail ? ' au-go' : '') + '"' + (U.state === 'checking' || U.state === 'updating' ? ' disabled' : '') + '>' + esc(avail ? T.update : T.check) + '</button>' +
      '<div class="au-msg" aria-live="polite">' + esc(msg) + '</div>' +
      '<details' + (U.open ? ' open' : '') + '><summary>' + esc(T.news) + '</summary><div class="au-list">' + (U.log ? logHtml() : '<p>' + esc(T.loading) + '</p>') + '</div></details>';
    if (U.open && !U.log) loadLog();
    bar.dataset.show = avail ? 'true' : 'false';
    bar.querySelector('span').textContent = avail ? T.ready(newVer()) : '';
  }
  function logHtml() {
    if (U.log === 'error') return '<p>' + esc(T.logError) + '</p>';
    return U.log.map(function (r) {
      return '<div class="au-rel"><h4>' + esc(r.version) + ' <span>· ' + esc(fmt(r.date)) + '</span></h4><ul>' +
        (r.notes || []).map(function (n) { return '<li>' + esc(n) + '</li>'; }).join('') + '</ul></div>';
    }).join('');
  }
  function loadLog() {
    U.log = U.log || null;
    fetch('changelog.json?v=' + encodeURIComponent(BUILD)).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { U.log = j; }, function () { U.log = 'error'; })
      .then(function () { var l = host.querySelector('.au-list'); if (l) l.innerHTML = logHtml(); });
  }
  function check(mode) {
    if (mode === 'manual') { U.state = 'checking'; render(); }
    return fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) {
        if (j.v && String(j.v) !== BUILD) {
          U.latest = j; U.state = 'available';
          if (mode === 'start' && new URLSearchParams(location.search).get('v') !== String(j.v)) { apply(); return; }
        } else if (mode === 'manual') U.state = 'latest';
        render();
      }, function () { if (mode === 'manual') { U.state = 'error'; render(); } });
  }
  function apply() {
    U.state = 'updating'; render();
    var go = function () { location.replace(location.pathname + '?v=' + encodeURIComponent(U.latest && U.latest.v || Date.now()) + location.hash); };
    // An app can register work to finish first (unsaved data): window.beforeAppUpdate = () => promise
    var p = typeof window.beforeAppUpdate === 'function' ? Promise.race([Promise.resolve().then(window.beforeAppUpdate), new Promise(function (r) { setTimeout(r, 4000); })]) : Promise.resolve();
    p.then(go, go);
  }
  window.appUpdates = { check: function () { return check('manual'); }, apply: apply };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  check('start');
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check('auto'); });
  setInterval(function () { if (document.visibilityState === 'visible') check('auto'); }, 900000);
})();
