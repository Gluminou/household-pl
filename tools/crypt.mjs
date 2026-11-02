// Encrypts or decrypts the budget data file with the family passphrase.
//   node tools/crypt.mjs encrypt data.json data.enc.json   (passphrase in HPL_PASS)
//   node tools/crypt.mjs decrypt data.enc.json data.json
// AES-GCM 256 with a PBKDF2-SHA256 key, the same scheme index.html decrypts in the browser.
import { readFileSync, writeFileSync } from "node:fs";
import { webcrypto as crypto } from "node:crypto";

const [mode, input, output] = process.argv.slice(2);
const pass = process.env.HPL_PASS;
if (!pass || !["encrypt", "decrypt"].includes(mode) || !input || !output) {
  console.error("Usage: HPL_PASS=... node tools/crypt.mjs encrypt|decrypt <in> <out>");
  process.exit(1);
}
const ITER = 310000;
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => Buffer.from(u8).toString("base64");
const unb64 = (s) => new Uint8Array(Buffer.from(s, "base64"));

async function key(salt, iter) {
  const base = await crypto.subtle.importKey("raw", enc.encode(pass), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" },
    base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

if (mode === "encrypt") {
  const data = JSON.parse(readFileSync(input, "utf8"));
  data.updated = new Date().toISOString();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(salt, ITER), enc.encode(JSON.stringify(data)));
  writeFileSync(output, JSON.stringify({ v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }) + "\n");
  console.log(`Encrypted ${data.entries?.length ?? 0} entries to ${output}`);
} else {
  const e = JSON.parse(readFileSync(input, "utf8"));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(e.iv) }, await key(unb64(e.salt), e.iter), unb64(e.ct));
  writeFileSync(output, JSON.stringify(JSON.parse(dec.decode(pt)), null, 2) + "\n");
  console.log(`Decrypted to ${output}`);
}
