// Publish a new version of the app.
//
//   node tools/release.mjs <1.4.0 | patch | minor | major> "What changed" ["Another change" ...]
//
// Writes, always in step: APP_RELEASE (1.4.0), APP_DATE (Hong Kong date) and
// APP_VERSION (build stamp) in the page source, version.json (read by installed
// apps to know an update is out) and changelog.json (the What's new list).
// Then runs the app's build, if it has one. Settings: tools/release.json
//   {"source": "index.html", "build": ["node build-site.js"]}
//
// Numbers: patch (1.3.0 -> 1.3.1) for a fix, minor (1.3.0 -> 1.4.0) for
// something new on screen, major for a rework.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = m => { console.error('release: ' + m); process.exit(1); };
const read = f => readFileSync(join(root, f), 'utf8');
const cfgPath = join(root, 'tools', 'release.json');
const cfg = Object.assign({ source: 'index.html', build: [] }, existsSync(cfgPath) ? JSON.parse(readFileSync(cfgPath, 'utf8')) : {});

const [arg, ...notes] = process.argv.slice(2);
if (!arg) fail('give a version (1.4.0) or patch, minor or major, then one note per change.');
if (!notes.length || notes.some(n => !n.trim())) fail('add at least one note saying what changed, in plain words.');

const current = JSON.parse(read('version.json'));
const log = existsSync(join(root, 'changelog.json')) ? JSON.parse(read('changelog.json')) : [];
const parse = v => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v || ''); return m ? m.slice(1).map(Number) : null; };
const cur = parse(current.version) || [0, 0, 0];
let next;
if (arg === 'patch') next = [cur[0], cur[1], cur[2] + 1];
else if (arg === 'minor') next = [cur[0], cur[1] + 1, 0];
else if (arg === 'major') next = [cur[0] + 1, 0, 0];
else next = parse(arg) || fail(`"${arg}" is not a version like 1.4.0`);
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
if (cmp(next, cur) <= 0) fail(`${next.join('.')} must be higher than the current ${cur.join('.')}.`);

const version = next.join('.');
const now = new Date();
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Hong_Kong' }).format(now); // YYYY-MM-DD
let src = read(cfg.source);
// APP_VERSION: a build stamp, or the version itself when the app already uses version numbers there.
const av = /const APP_VERSION\s*=\s*(["'])([^"']*)\1;/.exec(src);
let build = now.toISOString().slice(0, 16).replace(/[-:T]/g, '');
if (av && parse(av[2])) build = version;
const set = (name, value, required) => {
  const re = new RegExp(`const ${name}\\s*=\\s*(["'])[^"']*\\1;`, 'g');
  const hits = src.match(re) || [];
  if (hits.length > 1 || (required && hits.length !== 1)) fail(`expected one ${name} line in ${cfg.source}, found ${hits.length}.`);
  src = src.replace(re, `const ${name}="${value}";`);
};
set('APP_RELEASE', version, true);
set('APP_DATE', date, true);
if (av && /^[\d.]+$/.test(av[2])) set('APP_VERSION', build, true); // a placeholder means the build stamps it
writeFileSync(join(root, cfg.source), src);
writeFileSync(join(root, 'version.json'), JSON.stringify({ v: build, version, date, notes }, null, 2) + '\n');
writeFileSync(join(root, 'changelog.json'), JSON.stringify([{ version, date, notes }, ...log], null, 2) + '\n');
for (const cmd of cfg.build) execSync(cmd, { cwd: root, stdio: 'inherit' });
console.log(`Version ${version} (${date}), build ${JSON.parse(read('version.json')).v}`);
