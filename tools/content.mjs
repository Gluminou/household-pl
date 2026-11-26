// Puts an app's content into data.json of its private data repo, or reads it back.
// The content (recipes, pieces, schedule, floor plan, duty list...) lives only there,
// under one key that sync.js brings to every connected device. Other keys in data.json
// (what the devices save) are never touched.
//   node tools/content.mjs put   <content.json> <data.json> <key>    write or replace the content
//   node tools/content.mjs get   <data.json> <key> <content.json>    read it back
//   node tools/content.mjs check <content.json> <data.json> <key>    exit 1 if data.json holds something else
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [mode, a, b, key] = process.argv.slice(2);
const fail = m => { console.error('content: ' + m); process.exit(1); };
if (!['put', 'get', 'check'].includes(mode) || !a || !b || !key) fail('node tools/content.mjs put|check <content.json> <data.json> <key> | get <data.json> <key> <out.json>');
const readFile = f => JSON.parse(readFileSync(f, 'utf8'));

if (mode === 'get') {
  const [dataPath, k, out] = [a, b, key];
  const file = readFile(dataPath), raw = file.data && file.data[k];
  if (raw == null) fail(`${dataPath} holds no "${k}"`);
  writeFileSync(out, JSON.stringify(JSON.parse(raw), null, 1) + '\n');
  console.log(`"${k}" written to ${out}`);
} else {
  const content = readFile(a), packed = JSON.stringify(content);
  const file = existsSync(b) ? readFile(b) : { v: 1, data: {}, t: {} };
  if (mode === 'check') {
    if (!file.data || file.data[key] !== packed) fail(`${b} does not hold the current "${key}": run put`);
    console.log(`${b} holds the current "${key}"`);
  } else {
    if (file.data && file.data[key] === packed) { console.log(`"${key}" unchanged`); process.exit(0); }
    const now = Date.now();
    file.v = 1; file.updated = new Date(now).toISOString(); file.by = 'Claude';
    file.data = Object.assign({}, file.data, { [key]: packed });
    file.t = Object.assign({}, file.t, { [key]: now });
    writeFileSync(b, JSON.stringify(file, null, 1));
    console.log(`"${key}" written to ${b} (${(packed.length / 1024).toFixed(0)} KB)`);
  }
}
