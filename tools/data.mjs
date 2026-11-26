// Reads or writes the budget in data.json of the private repo Gluminou/household-pl-data.
//   node tools/data.mjs get <data.json> <budget.plain.json>    budget out, readable and editable
//   node tools/data.mjs put <budget.plain.json> <data.json>    budget back in, stamped "updated"
// data.json is the file sync.js (shared by all Gluminou apps) reads: the budget is the value of
// the key "hpl-data", as a JSON string, with the time of the change in t, so every phone takes it.
// Never commit a plain budget file to this public repo (*.plain.json is ignored).
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const [mode, input, output] = process.argv.slice(2);
const KEY = 'hpl-data';
const fail = m => { console.error('data: ' + m); process.exit(1); };
if (!['get', 'put'].includes(mode) || !input || !output) fail('node tools/data.mjs get <data.json> <out.plain.json> | put <in.plain.json> <data.json>');

if (mode === 'get') {
  const file = JSON.parse(readFileSync(input, 'utf8'));
  const raw = file.data && file.data[KEY];
  if (!raw) fail(`${input} holds no budget (no "${KEY}")`);
  const budget = JSON.parse(raw);
  writeFileSync(output, JSON.stringify(budget, null, 2) + '\n');
  console.log(`${budget.entries?.length ?? 0} entries, updated ${budget.updated}, written to ${output}`);
} else {
  const budget = JSON.parse(readFileSync(input, 'utf8'));
  if (!budget.config || !Array.isArray(budget.entries)) fail(`${input} needs "config" and "entries"`);
  const ids = new Set();
  for (const e of budget.entries) {
    if (ids.has(e.id)) fail(`duplicate entry id ${e.id}`); ids.add(e.id);
    if (Array.isArray(e.items) && e.items.length) {
      const sum = Math.round(e.items.reduce((a, i) => a + i.amount, 0) * 100) / 100;
      if (Math.abs(sum - e.amount) > 0.005) fail(`${e.id}: items add up to ${sum}, entry says ${e.amount}`);
    }
  }
  const now = Date.now();
  budget.updated = new Date(now).toISOString();
  const file = existsSync(output) ? JSON.parse(readFileSync(output, 'utf8')) : { v: 1, app: 'household-pl', data: {}, t: {} };
  file.v = 1; file.app = 'household-pl'; file.updated = budget.updated; file.by = 'Claude';
  file.data = Object.assign({}, file.data, { [KEY]: JSON.stringify(budget) });
  file.t = Object.assign({}, file.t, { [KEY]: now });
  writeFileSync(output, JSON.stringify(file, null, 1));
  console.log(`${budget.entries.length} entries written to ${output}`);
}
