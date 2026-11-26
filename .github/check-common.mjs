// Checks that an app follows the common system of Gluminou's apps.
//   node .github/check-common.mjs [app root]      (app root: where index.html is, default .)
//
// The master copies live in the public repo Gluminou/app-common, listed in its
// files.json. Every app keeps exact copies of them. This check fails when:
//   - a shared file differs from its master copy (someone changed a copy only),
//   - a required shared file is missing,
//   - the page doesn't load updates.js, or declares APP_SYNC without loading sync.js,
//   - the home-screen install is incomplete (manifest, icons, links in the page).
//
// A repo can opt out of one file with a reason, in .github/common.json:
//   {"skip": {"tools/release.mjs": "versions are published from the private Kamy repo"}}
//
// To change a shared file: change it in app-common first, then copy it into every app.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://raw.githubusercontent.com/Gluminou/app-common/main/';
const root = process.argv[2] || '.';
const problems = [];
const norm = s => s.replace(/\r\n/g, '\n');

async function get(path) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(BASE + path + '?t=' + Date.now(), { cache: 'no-store' });
      if (r.ok) return await r.text();
      last = new Error('HTTP ' + r.status);
      if (r.status === 404) break;
    } catch (e) { last = e; }
    await new Promise(r => setTimeout(r, 1500));
  }
  throw new Error(`can't read ${path} from Gluminou/app-common (${last && last.message})`);
}

const spec = JSON.parse(await get('files.json'));
const cfgPath = '.github/common.json';
const skip = existsSync(cfgPath) ? (JSON.parse(readFileSync(cfgPath, 'utf8')).skip || {}) : {};

// The built page, as GitHub Pages serves it.
const at = f => join(root, f);
const page = existsSync(at('index.html')) ? readFileSync(at('index.html'), 'utf8') : '';
const usesSync = /\bAPP_SYNC\b/.test(page);
const hasContent = /\bAPP_SYNC\b[\s\S]{0,400}\bcontent\s*:/.test(page); // its content lives in the private repo

for (const f of spec.files) {
  const local = f.place === 'app' ? at(f.path) : f.path;
  if (skip[f.path]) { console.log(`skipped  ${f.path} (${skip[f.path]})`); continue; }
  const required = f.required === true || (f.required === 'APP_SYNC' && usesSync) || (f.required === 'content' && hasContent);
  if (!existsSync(local)) {
    if (required) problems.push(`${local} is missing: copy ${f.master} from Gluminou/app-common`);
    continue;
  }
  const master = norm(await get(f.master));
  if (norm(readFileSync(local, 'utf8')) !== master) {
    problems.push(`${local} differs from the master copy ${f.master} in Gluminou/app-common: change the master first, then copy it here`);
  } else console.log(`same     ${local}`);
}

if (!/src=["']updates\.js["']/.test(page)) problems.push('index.html does not load updates.js');
if (!usesSync) problems.push('index.html declares no APP_SYNC: every app is locked behind a key and syncs through its private repo');
if (/\block\s*:\s*false\b/.test(page)) problems.push('APP_SYNC has lock: false: every app stays locked behind a key');
if (usesSync && !/src=["']sync\.js["']/.test(page)) problems.push('index.html declares APP_SYNC but does not load sync.js');
for (const f of spec.present || []) {
  if (skip[f]) continue;
  if (!existsSync(at(f))) problems.push(`${at(f)} is missing (home-screen install)`);
}
if (!/rel=["']manifest["']/.test(page)) problems.push('index.html has no <link rel="manifest">');
if (!/rel=["']apple-touch-icon["']/.test(page)) problems.push('index.html has no <link rel="apple-touch-icon">');

if (problems.length) {
  console.error('\nNot following the common system:');
  problems.forEach(p => console.error('  - ' + p));
  process.exit(1);
}
console.log('\nFollows the common system: locked behind a key, synced through its private repo.');
