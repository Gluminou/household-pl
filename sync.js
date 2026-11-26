/* Sync between devices.
   The same file is used in each of Gluminou's apps; keep the copies identical.

   The page defines, before loading this file:
     const APP_SYNC = {
       app: "job-tracker",                // name of the app
       keys: ["jobtracker.v1"],           // localStorage keys to sync
       prefixes: [],                      // optional: every key starting with one of these
       repo: "Gluminou/job-tracker-data", // optional, this is the default: Gluminou/<app>-data
       reload: false,                     // optional: reload the page when data arrives
       content: "carnet-content",         // optional: key holding the app's content, written by Claude
       lock: true                         // default: without a key the app shows only the key screen
     };
   Optional: <div id="app-sync"></div> where the section goes; without it the
   section goes just before #app-updates, or at the end of the page.

   Where the data lives: data.json in a private repo, one repo per app, so a
   GitHub key (fine-grained token) can be allowed on some apps and not others.
   The key needs "Contents: Read and write" on that repo (Read only = view only).
   On a computer all the apps share the address gluminou.github.io, so a key
   entered in one app is offered to the others; each app can be disconnected
   on its own.

   When data arrives from another device it is written to localStorage, then a
   "storage" event is fired on window for each changed key (as if another tab
   had written it) and an "appsync" event with detail {keys}. The app listens
   to one of them and redraws. With reload: true the page reloads instead.
   Each time the sync state changes, an "appsyncstatus" event carries
   {connected, state: idle|busy|ok|err|view, pending, message} for apps that
   show it themselves; window.appSync.status() returns the same.

   Locked apps (the default): until the device is connected with a key that
   opens the repo, a full-screen card asks for the key; nothing else is usable.
   With "content", the app's content itself (recipes, schedule, floor plan...)
   lives only in the private repo, under that key, and the card stays until it
   has arrived. When the content changes, the page reloads to use it.
   Disconnecting a locked app removes its content from the device.

   Merging: the module keeps the last version both sides agreed on and merges
   three ways, so a change made on one device is never lost because of an
   unrelated change on another. Inside JSON values, objects are merged field by
   field, lists of items with an "id" (or "key") item by item, lists of plain
   values as sets. When both devices changed the same thing, the latest wins. */
(function () {
  if (window.__appSync) return; window.__appSync = true;
  var C = typeof APP_SYNC !== 'undefined' ? APP_SYNC : window.APP_SYNC;
  if (!C || !C.app) return;
  var APP = String(C.app), REPO = C.repo || 'Gluminou/' + APP + '-data', FILE = 'data.json';
  var KEYS = (C.keys || []).slice(), PREFIXES = C.prefixes || [];
  var CONTENT = C.content || '', LOCK = C.lock !== false;
  if (CONTENT && KEYS.indexOf(CONTENT) < 0) KEYS.push(CONTENT);
  var API = 'https://api.github.com';
  var LS; try { LS = window.localStorage; LS.getItem('x'); } catch (e) { return; }

  var K_SHARED = 'gsync.key', K_APP = 'gsync.key.' + APP, K_OFF = 'gsync.off.' + APP,
    K_DEV = 'gsync.device', K_STATE = 'gsync.state.' + APP;
  var isOwn = function (k) { return typeof k === 'string' && k.indexOf('gsync.') === 0; };
  var tracked = function (k) {
    if (typeof k !== 'string' || isOwn(k)) return false;
    if (KEYS.indexOf(k) >= 0) return true;
    for (var i = 0; i < PREFIXES.length; i++) if (k.indexOf(PREFIXES[i]) === 0) return true;
    return false;
  };

  /* ---------- words ---------- */
  var WORDS = {
    fr: {
      title: 'Synchronisation entre appareils', off: 'Les données de cette app restent sur cet appareil.',
      intro: 'Collez la clé GitHub qui ouvre les données de cette app', keyL: 'Clé GitHub', devL: 'Nom de cet appareil',
      connect: 'Connecter', connecting: 'Connexion…', now: 'Synchroniser', disc: 'Déconnecter cet appareil',
      on: 'Synchronisé', busy: 'Synchronisation…', never: 'pas encore synchronisé', ago: 'il y a ', justNow: "à l'instant",
      min: ' min', h: ' h', d: ' j', device: 'Cet appareil : ', view: 'Lecture seule : cette clé peut voir mais pas modifier ces données.',
      badkey: 'Clé refusée ou expirée. Collez une nouvelle clé.', norepo: "Le dépôt {r} n'existe pas, ou cette clé n'y a pas accès.",
      denied: "Cette clé n'a pas accès au dépôt {r}.", rate: 'GitHub demande de patienter un peu. Nouvel essai plus tard.',
      net: 'Hors ligne. Les changements partiront au retour du réseau.', other: 'Erreur GitHub {s}. Nouvel essai plus tard.',
      pending: 'Changements en attente d’envoi.', got: 'Reçu d’un autre appareil.', empty: 'Collez une clé.',
      lockT: 'Cette app demande une clé', lockP: 'Collez la clé GitHub qu’on vous a donnée pour cette app. Il suffit de le faire une fois sur cet appareil.',
      opening: 'Ouverture…', firstNet: 'Connectez-vous à Internet pour l’ouvrir la première fois sur cet appareil.',
      locale: 'fr-FR'
    },
    en: {
      title: 'Sync between devices', off: 'This app’s data stays on this device.',
      intro: 'Paste the GitHub key that opens this app’s data', keyL: 'GitHub key', devL: 'Name of this device',
      connect: 'Connect', connecting: 'Connecting…', now: 'Sync now', disc: 'Disconnect this device',
      on: 'Synced', busy: 'Syncing…', never: 'not synced yet', ago: '', justNow: 'just now',
      min: ' min ago', h: ' h ago', d: ' d ago', device: 'This device: ', view: 'View only: this key can see this data but not change it.',
      badkey: 'Key refused or expired. Paste a new key.', norepo: 'The repo {r} doesn’t exist, or this key can’t open it.',
      denied: 'This key isn’t allowed on the repo {r}.', rate: 'GitHub asked to wait a little. Trying again later.',
      net: 'Offline. Changes will go out when you’re back online.', other: 'GitHub error {s}. Trying again later.',
      pending: 'Changes waiting to go out.', got: 'Received from another device.', empty: 'Paste a key.',
      lockT: 'This app needs a key', lockP: 'Paste the GitHub key you were given for this app. You only do this once on this device.',
      opening: 'Opening…', firstNet: 'Connect to the internet to open it the first time on this device.',
      locale: 'en-GB'
    }
  };
  var T = function () { return /^fr/i.test(document.documentElement.lang || '') ? WORDS.fr : WORDS.en; };

  /* ---------- small helpers ---------- */
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var rawGet = Storage.prototype.getItem, rawSet = Storage.prototype.setItem, rawDel = Storage.prototype.removeItem;
  var get = function (k) { try { return rawGet.call(LS, k); } catch (e) { return null; } };
  var put = function (k, v) { try { rawSet.call(LS, k, v); } catch (e) {} };
  var del = function (k) { try { rawDel.call(LS, k); } catch (e) {} };
  var parse = function (s, d) { try { var v = JSON.parse(s); return v == null ? d : v; } catch (e) { return d; } };
  var b64enc = function (s) { var u = new TextEncoder().encode(s), bin = ''; for (var i = 0; i < u.length; i += 8192) bin += String.fromCharCode.apply(null, u.subarray(i, i + 8192)); return btoa(bin); };
  var b64dec = function (s) { return new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/\s/g, '')), function (c) { return c.charCodeAt(0); })); };
  var guessDevice = function () {
    var u = navigator.userAgent || '';
    return /iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) || (/Macintosh/.test(u) && navigator.maxTouchPoints > 1) ? 'iPad' :
      /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows PC' : 'Browser';
  };

  /* ---------- merge (pure, also used by the tests) ---------- */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return v === undefined ? 'undefined' : JSON.stringify(v);
  }
  var eq = function (a, b) { return a === b || stable(a) === stable(b); };
  var isObj = function (v) { return v !== null && typeof v === 'object' && !Array.isArray(v); };
  var has = function (o, k) { return isObj(o) && Object.prototype.hasOwnProperty.call(o, k); };
  function idField(list) {
    if (!list.length) return null;
    var f = ['id', 'key'];
    for (var i = 0; i < f.length; i++) {
      var ok = list.every(function (x) { return isObj(x) && (typeof x[f[i]] === 'string' || typeof x[f[i]] === 'number'); });
      if (ok) return f[i];
    }
    return null;
  }
  // b: last agreed value (undefined when none), l: this device, r: the other side, pl: true when this device's change is the latest
  function merge3(b, l, r, pl) {
    if (eq(l, r)) return l;
    if (eq(l, b)) return r;
    if (eq(r, b)) return l;
    if (l === undefined) return r; // deleted here, changed there: the change wins
    if (r === undefined) return l;
    if (isObj(l) && isObj(r)) {
      var out = {}, seen = {};
      Object.keys(l).concat(Object.keys(r)).forEach(function (k) {
        if (seen[k]) return; seen[k] = true;
        var v = merge3(has(b, k) ? b[k] : undefined, has(l, k) ? l[k] : undefined, has(r, k) ? r[k] : undefined, pl);
        if (v !== undefined) out[k] = v;
      });
      return out;
    }
    if (Array.isArray(l) && Array.isArray(r)) {
      var base = Array.isArray(b) ? b : [], f = idField(l.concat(r));
      if (f && (!base.length || idField(base) === f)) return mergeList(base, l, r, pl, function (x) { return String(x[f]); }, true);
      var prim = function (x) { return x === null || typeof x !== 'object'; };
      if (l.every(prim) && r.every(prim) && base.every(prim)) return mergeList(base, l, r, pl, function (x) { return typeof x + ':' + String(x); }, false);
    }
    return pl ? l : r;
  }
  function mergeList(b, l, r, pl, id, deep) {
    var map = function (a) { var m = {}; a.forEach(function (x) { m[id(x)] = x; }); return m; };
    var B = map(b), L = map(l), R = map(r), first = pl ? l : r, out = [], done = {};
    var pick = function (k) {
      if (done[k]) return; done[k] = true;
      var inB = Object.prototype.hasOwnProperty.call(B, k), inL = Object.prototype.hasOwnProperty.call(L, k), inR = Object.prototype.hasOwnProperty.call(R, k);
      if (inL && inR) { out.push(deep ? merge3(inB ? B[k] : undefined, L[k], R[k], pl) : L[k]); return; }
      var one = inL ? L[k] : R[k];
      if (inB && (!deep || eq(one, B[k]))) return; // removed on the other side and untouched here: stays removed
      out.push(one);
    };
    first.forEach(function (x) { pick(id(x)); });
    (pl ? r : l).forEach(function (x) { pick(id(x)); });
    return out;
  }
  // whole store: base/local/remote are {key: raw string}; tl/tr are {key: time of last change}
  function mergeStore(base, local, remote, tl, tr) {
    var out = {}, times = {}, seen = {};
    Object.keys(base).concat(Object.keys(local), Object.keys(remote)).forEach(function (k) {
      if (seen[k]) return; seen[k] = true;
      var b = base[k], l = local[k], r = remote[k], a = tl[k] || 0, z = tr[k] || 0, v;
      if (l === r) v = l;
      else if (l === b) v = r;
      else if (r === b) v = l;
      else if (l === undefined) v = r;
      else if (r === undefined) v = l;
      else {
        var pb = b === undefined ? undefined : parse(b, b), pL = parse(l, null), pR = parse(r, null);
        if (pL !== null && pR !== null && typeof pL === 'object' && typeof pR === 'object') v = JSON.stringify(merge3(pb, pL, pR, a > z));
        else v = a > z ? l : r;
      }
      if (v !== undefined) { out[k] = v; times[k] = v === l && v !== r ? a : v === r && v !== l ? z : Math.max(a, z); }
    });
    return { data: out, t: times };
  }

  window.appSyncMerge = { merge3: merge3, mergeStore: mergeStore };
  if (C.testOnly) return;

  /* ---------- state ---------- */
  var S = parse(get(K_STATE), {});
  S.remote = S.remote || null; // last file both sides agreed on: {data, t}
  S.t = S.t || {};             // when each key last changed on this device
  var status = { state: 'idle', msg: '', got: false }, busy = false, again = false, gen = 0, timer = 0, applying = false, form = { open: false };
  var saveState = function () { put(K_STATE, JSON.stringify({ remote: S.remote, t: S.t, sha: S.sha, etag: S.etag, last: S.last, dirty: S.dirty })); };
  var token = function () { if (get(K_OFF)) return ''; return get(K_APP) || get(K_SHARED) || ''; };
  var device = function () { return get(K_DEV) || guessDevice(); };
  function snapshot() {
    var o = {};
    for (var i = 0; i < LS.length; i++) { var k = LS.key(i); if (tracked(k)) { var v = get(k); if (v != null) o[k] = v; } }
    return o;
  }
  var sameAsBase = function (snap) { return eq(snap, S.remote ? S.remote.data : {}); };

  /* ---------- watch this app's own saves ---------- */
  function touched(k) {
    if (applying || !tracked(k)) return;
    S.t[k] = Date.now(); S.dirty = true; gen++; saveState(); render(); schedule(1200);
  }
  Storage.prototype.setItem = function (k, v) {
    var mine = this === LS && tracked(String(k)), before = mine ? get(String(k)) : null;
    rawSet.apply(this, arguments);
    if (mine && before !== String(v)) touched(String(k));
  };
  Storage.prototype.removeItem = function (k) {
    var mine = this === LS && tracked(String(k)), before = mine ? get(String(k)) : null;
    rawDel.apply(this, arguments);
    if (mine && before !== null) touched(String(k));
  };

  /* ---------- GitHub ---------- */
  function fail(kind, s) { var e = new Error(kind); e.kind = kind; e.status = s; return e; }
  function call(path, opt) {
    opt = opt || {};
    var h = { Authorization: 'Bearer ' + token(), Accept: 'application/vnd.github+json' };
    for (var k in opt.headers || {}) h[k] = opt.headers[k];
    if (opt.body) h['Content-Type'] = 'application/json';
    return fetch(API + path, { method: opt.method || 'GET', headers: h, body: opt.body, cache: 'no-store', keepalive: !!opt.keepalive })
      .catch(function () { throw fail('net'); });
  }
  function why(r) {
    if (r.status === 401) return fail('badkey', 401);
    if (r.status === 403 && r.headers.get('x-ratelimit-remaining') === '0' || r.status === 429) return fail('rate', r.status);
    return fail('other', r.status);
  }
  function readFile() {
    var etag = S.etag && S.remote ? { 'If-None-Match': S.etag } : {};
    return call('/repos/' + REPO + '/contents/' + FILE, { headers: etag }).then(function (r) {
      if (r.status === 304) return { same: true };
      if (r.status === 404) return call('/repos/' + REPO).then(function (q) {
        if (q.status === 200) return { file: null, sha: null }; // repo there, file not written yet
        if (q.status === 404 || q.status === 403) throw fail('norepo', q.status);
        throw why(q);
      });
      if (r.status === 403 && r.headers.get('x-ratelimit-remaining') !== '0') throw fail('denied', 403);
      if (!r.ok) throw why(r);
      var tag = r.headers.get('etag');
      return r.json().then(function (j) {
        var text = j.content ? Promise.resolve(b64dec(j.content)) :
          call('/repos/' + REPO + '/contents/' + FILE, { headers: { Accept: 'application/vnd.github.raw' } }).then(function (q) { if (!q.ok) throw why(q); return q.text(); });
        return text.then(function (t) { return { file: parse(t, null), sha: j.sha, etag: tag }; });
      });
    });
  }
  function writeFile(file, sha, keepalive) {
    var body = { message: 'Sync from ' + device(), content: b64enc(JSON.stringify(file, null, 1)) };
    if (sha) body.sha = sha;
    return call('/repos/' + REPO + '/contents/' + FILE, { method: 'PUT', body: JSON.stringify(body), keepalive: keepalive }).then(function (r) {
      if (r.status === 409 || r.status === 422) return { conflict: true };
      if (r.status === 403 || r.status === 404) throw fail('readonly', r.status);
      if (!r.ok) throw why(r);
      return r.json().then(function (j) { return { sha: j.content && j.content.sha }; });
    });
  }

  /* ---------- one round ---------- */
  function apply(data, times) {
    var changed = [], now = snapshot(), olds = {};
    applying = true;
    try {
      Object.keys(now).forEach(function (k) { if (!(k in data)) { olds[k] = now[k]; rawDel.call(LS, k); changed.push(k); } });
      Object.keys(data).forEach(function (k) { if (now[k] !== data[k]) { olds[k] = now[k] == null ? null : now[k]; rawSet.call(LS, k, data[k]); changed.push(k); } });
    } catch (e) {} finally { applying = false; }
    Object.keys(times).forEach(function (k) { S.t[k] = Math.max(S.t[k] || 0, times[k] || 0); });
    if (!changed.length) return changed;
    status.got = Date.now();
    if (C.reload || (CONTENT && changed.indexOf(CONTENT) >= 0)) { saveState(); setTimeout(function () { location.reload(); }, 50); return changed; }
    changed.forEach(function (k) {
      try { window.dispatchEvent(new StorageEvent('storage', { key: k, oldValue: olds[k], newValue: data[k] == null ? null : data[k], storageArea: LS, url: location.href })); } catch (e) {}
    });
    try { window.dispatchEvent(new CustomEvent('appsync', { detail: { keys: changed } })); } catch (e) {}
    return changed;
  }
  function round(keepalive) {
    return readFile().then(function (got) {
      if (got.same && !S.dirty) return 'done';
      var remote = got.same ? S.remote : got.file && got.file.data ? { data: got.file.data, t: got.file.t || {} } : { data: {}, t: {} };
      var sha = got.same ? S.sha : got.sha;
      if (!got.same) S.etag = got.etag || null;
      var mark = gen, local = snapshot();
      var M = mergeStore(S.remote ? S.remote.data : {}, local, remote.data, S.t, remote.t);
      apply(M.data, M.t);
      if (eq(M.data, remote.data)) {
        S.remote = { data: M.data, t: M.t }; S.sha = sha;
        if (gen === mark) S.dirty = false;
        return 'done';
      }
      var file = { v: 1, app: APP, updated: new Date().toISOString(), by: device(), data: M.data, t: M.t };
      return writeFile(file, sha, keepalive).then(function (w) {
        if (w.conflict) { S.etag = null; return 'again'; }
        S.remote = { data: M.data, t: M.t }; S.sha = w.sha; S.etag = null;
        if (gen === mark) S.dirty = false;
        return 'done';
      });
    });
  }
  function sync(opts) {
    opts = opts || {};
    if (!token()) { status.state = 'idle'; render(); return Promise.resolve(); }
    if (busy) { again = true; return Promise.resolve(); }
    busy = true; clearTimeout(timer); status.state = 'busy'; render();
    var tries = 0;
    var go = function () {
      return round(opts.keepalive).then(function (res) {
        if (res === 'again' && ++tries < 4) return go();
        if (res === 'again') throw fail('other', 409);
      });
    };
    return go().then(function () {
      S.last = Date.now(); status.state = 'ok'; status.msg = '';
    }, function (e) {
      status.state = e.kind === 'readonly' ? 'view' : 'err'; status.msg = e.kind || 'other'; status.code = e.status;
      if (e.kind === 'readonly') S.last = Date.now();
    }).then(function () {
      saveState(); busy = false; render();
      if (again) { again = false; schedule(300); }
    });
  }
  function schedule(ms) { clearTimeout(timer); if (token()) timer = setTimeout(sync, ms); }

  /* ---------- section on the page ---------- */
  var css = '.as{max-width:720px;margin:0 auto;padding:18px 16px 6px;display:grid;gap:10px;justify-items:center;text-align:center;font:inherit;font-size:14px;color:inherit}' +
    '.as h3{margin:0;font-size:14px}.as-row{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;align-items:center}' +
    '.as-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#9aa0a6;margin-right:6px;vertical-align:middle}' +
    '.as-dot.ok{background:#2e9d6a}.as-dot.busy{background:#e0a800}.as-dot.err{background:#d0443e}.as-dot.view{background:#4a7fd4}' +
    '.as-msg{opacity:.8;max-width:460px}.as form{display:grid;gap:8px;width:100%;max-width:420px;text-align:left}' +
    '.as label{display:grid;gap:4px;font-size:13px;opacity:.9}' +
    '.as input{font:inherit;font-size:15px;padding:9px 10px;border-radius:10px;border:1px solid rgba(127,127,127,.45);background:transparent;color:inherit;width:100%;box-sizing:border-box}' +
    '.as-btn{font:inherit;font-weight:700;font-size:14px;border-radius:10px;padding:9px 16px;cursor:pointer;border:1px solid var(--au-accent,#0f6b5c);background:transparent;color:var(--au-accent,#0f6b5c)}' +
    '.as-btn.as-go{background:var(--au-accent,#0f6b5c);color:#fff}.as-btn:disabled{opacity:.55;cursor:default}' +
    '.as-link{font:inherit;font-size:13px;background:none;border:0;color:inherit;opacity:.7;text-decoration:underline;cursor:pointer;padding:4px}' +
    '.as-btn:focus-visible,.as-link:focus-visible,.as input:focus-visible{outline:2px solid var(--au-accent,#0f6b5c);outline-offset:2px}' +
    'html.as-locked,html.as-locked body{overflow:hidden!important}' +
    '.as-lock{position:fixed;inset:0;z-index:2147483600;display:flex;align-items:center;justify-content:center;padding:24px 18px calc(24px + env(safe-area-inset-bottom,0px));background:Canvas;color:CanvasText;color-scheme:light dark;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;font-size:15px;overflow:auto}' +
    '.as-lock[hidden]{display:none}.as-lock .as-card{width:100%;max-width:400px;display:grid;gap:12px}' +
    '.as-lock h2{margin:0;font-size:22px}.as-lock .as-app{font-size:13px;opacity:.65;font-weight:700;letter-spacing:.04em;text-transform:uppercase}' +
    '.as-lock p{margin:0;opacity:.8;line-height:1.45}.as-lock .as-err{color:#d0443e;opacity:1}' +
    '.as-lock label{display:grid;gap:4px;font-size:13px;opacity:.9}.as-lock input{font:inherit;font-size:16px;padding:11px 12px;border-radius:10px;border:1px solid rgba(127,127,127,.5);background:transparent;color:inherit;width:100%;box-sizing:border-box}' +
    '.as-lock form{display:grid;gap:14px}.as-lock .as-btn{font-size:16px;padding:12px 16px}';
  var host, lockEl;
  var APPNAME = (document.querySelector('meta[name="apple-mobile-web-app-title"]') || {}).content || document.title;
  function connect(root) {
    var k = (root.querySelector('input[name=k]').value || '').trim(), d = (root.querySelector('input[name=d]').value || '').trim();
    if (!k) { form.err = T().empty; render(); return; }
    put(K_APP, k); if (!get(K_SHARED)) put(K_SHARED, k); del(K_OFF);
    if (d) put(K_DEV, d);
    S = { t: S.t || {} }; status.state = 'busy'; status.msg = ''; form.open = false; form.err = ''; render();
    sync();
  }
  var refused = function () { return status.state === 'err' && /^(badkey|denied|norepo)$/.test(status.msg); };
  function locked() {
    if (!LOCK) return false;
    if (!token() || refused() || !S.last) return true; // never opened before the key has worked once
    return !!CONTENT && get(CONTENT) == null;
  }
  function renderLock() {
    if (!lockEl) return;
    var on = locked();
    lockEl.hidden = !on; document.documentElement.classList.toggle('as-locked', on);
    if (!on) return;
    var w = T(), ask = !token() || refused();
    var err = form.err || (status.state === 'err' ? (w[status.msg] || w.other).replace('{r}', REPO).replace('{s}', status.code || '') : '');
    if (ask && lockEl.querySelector('form') && lockEl.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') {
      lockEl.querySelector('.as-err').textContent = err; return; // don't wipe what is being typed
    }
    lockEl.innerHTML = '<div class="as-card"><div class="as-app">' + esc(APPNAME) + '</div>' + (ask ?
      '<h2>' + esc(w.lockT) + '</h2><p>' + esc(w.lockP) + '</p><form autocomplete="off">' +
      '<label>' + esc(w.keyL) + '<input name="k" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>' +
      '<label>' + esc(w.devL) + '<input name="d" type="text" value="' + esc(device()) + '"></label>' +
      '<p class="as-err" aria-live="polite">' + esc(err) + '</p>' +
      '<button class="as-btn as-go" type="submit">' + esc(w.connect) + '</button></form>' :
      '<h2>' + esc(status.state === 'err' && status.msg === 'net' ? w.firstNet : w.opening) + '</h2>' +
      (err && status.msg !== 'net' ? '<p class="as-err">' + esc(err) + '</p>' : '')) + '</div>';
  }
  function mount() {
    var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
    host = document.getElementById('app-sync');
    if (!host) {
      host = document.createElement('section'); host.id = 'app-sync';
      var upd = document.getElementById('app-updates');
      if (upd && upd.parentNode) upd.parentNode.insertBefore(host, upd); else document.body.appendChild(host);
    }
    host.classList.add('as');
    if (LOCK) {
      lockEl = document.createElement('div'); lockEl.className = 'as-lock'; lockEl.hidden = true;
      lockEl.setAttribute('role', 'dialog'); lockEl.setAttribute('aria-modal', 'true');
      document.body.appendChild(lockEl);
      lockEl.addEventListener('submit', function (e) { e.preventDefault(); connect(lockEl); });
    }
    host.addEventListener('click', function (e) {
      var b = e.target.closest('[data-as]'); if (!b) return;
      var a = b.getAttribute('data-as');
      if (a === 'now') { S.etag = null; sync(); }
      else if (a === 'open') { form.open = true; render(); var i = host.querySelector('input[name=k]'); if (i) i.focus(); }
      else if (a === 'cancel') { form.open = false; form.err = ''; render(); }
      else if (a === 'disc') {
        del(K_APP); put(K_OFF, '1'); S = { t: {} }; saveState(); status = { state: 'idle', msg: '' };
        if (LOCK && CONTENT) { del(CONTENT); location.reload(); return; }
        render();
      }
    });
    host.addEventListener('submit', function (e) { e.preventDefault(); connect(host); });
    render();
  }
  function ago(t) {
    var w = T(); if (!t) return w.never;
    var s = (Date.now() - t) / 1000;
    if (s < 60) return w.justNow;
    if (s < 3600) return w.ago + Math.floor(s / 60) + w.min;
    if (s < 86400) return w.ago + Math.floor(s / 3600) + w.h;
    return w.ago + Math.floor(s / 86400) + w.d;
  }
  function info() {
    var w = T(), st = status.state;
    return { connected: !!token(), locked: locked(), state: token() ? st : 'idle', pending: !!S.dirty,
      message: st === 'err' ? (w[status.msg] || w.other).replace('{r}', REPO).replace('{s}', status.code || '') : st === 'view' ? w.view : '' };
  }
  var lastInfo = '';
  function render() {
    var i = info(), k = JSON.stringify(i);
    if (k !== lastInfo) { lastInfo = k; try { window.dispatchEvent(new CustomEvent('appsyncstatus', { detail: i })); } catch (e) {} }
    renderLock();
    if (!host) return;
    var w = T(), on = !!token();
    if (host.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; // don't wipe what is being typed
    if (!on || form.open) {
      host.innerHTML = '<h3>' + esc(w.title) + '</h3>' + (form.open ?
        '<form autocomplete="off"><div class="as-msg">' + esc(w.intro) + ' (' + esc(REPO) + ').</div>' +
        '<label>' + esc(w.keyL) + '<input name="k" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="github_pat_…"></label>' +
        '<label>' + esc(w.devL) + '<input name="d" type="text" value="' + esc(device()) + '"></label>' +
        (form.err ? '<div class="as-msg">' + esc(form.err) + '</div>' : '') +
        '<div class="as-row"><button class="as-btn as-go" type="submit">' + esc(w.connect) + '</button>' +
        '<button class="as-link" type="button" data-as="cancel">×</button></div></form>' :
        '<div class="as-msg">' + esc(w.off) + '</div><button class="as-btn" type="button" data-as="open">' + esc(w.connect) + '</button>');
      return;
    }
    var st = status.state, dot = st === 'busy' ? 'busy' : st === 'err' ? 'err' : st === 'view' ? 'view' : S.last ? 'ok' : '';
    var msg = st === 'busy' ? w.busy : st === 'err' ? (w[status.msg] || w.other).replace('{r}', REPO).replace('{s}', status.code || '') :
      st === 'view' ? w.view : w.on + ' · ' + ago(S.last);
    var extra = status.got && Date.now() - status.got < 90000 && st === 'ok' ? w.got : S.dirty && st !== 'busy' ? w.pending : '';
    host.innerHTML = '<h3>' + esc(w.title) + '</h3>' +
      '<div class="as-msg" aria-live="polite"><span class="as-dot ' + dot + '"></span>' + esc(msg) + '</div>' +
      (extra ? '<div class="as-msg">' + esc(extra) + '</div>' : '') +
      '<div class="as-msg">' + esc(w.device + device()) + '</div>' +
      '<div class="as-row"><button class="as-btn" type="button" data-as="now"' + (st === 'busy' ? ' disabled' : '') + '>' + esc(w.now) + '</button>' +
      (status.msg === 'badkey' ? '<button class="as-btn" type="button" data-as="open">' + esc(w.connect) + '</button>' : '') + '</div>' +
      '<button class="as-link" type="button" data-as="disc">' + esc(w.disc) + '</button>';
  }

  /* ---------- when to sync ---------- */
  if (S.dirty || !sameAsBase(snapshot())) S.dirty = true;
  window.appSync = { sync: function () { S.etag = null; return sync(); }, repo: REPO, status: info };
  var prev = window.beforeAppUpdate; // updates.js waits for this before reloading into a new version
  window.beforeAppUpdate = function () { return Promise.resolve(typeof prev === 'function' ? prev() : 0).then(function () { return S.dirty ? sync() : 0; }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  sync();
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') sync();
    else if (S.dirty && token() && !busy) sync({ keepalive: true });
  });
  window.addEventListener('online', function () { sync(); });
  window.addEventListener('pageshow', function (e) { if (e.persisted) sync(); });
  window.addEventListener('focus', function () { if (Date.now() - (S.last || 0) > 15000) sync(); });
  setInterval(function () { if (document.visibilityState === 'visible') sync(); }, 30000);
  setInterval(function () { if (status.state === 'ok') render(); }, 60000);
})();
