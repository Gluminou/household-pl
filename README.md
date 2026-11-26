# Household P&L

Monthly household budget: budget per line, expenses from receipts, savings, groceries by type, the year so far. A home-screen app shared with the family.

## Where the data lives

The budget is in `data.json` in the private repo **Gluminou/household-pl-data**, never in this public repo. Each phone connects once with its own fine-grained GitHub key (Contents: Read and write, or Read-only, on that repo), in **Sync between devices** at the bottom of the app. Whoever has no key on that repo can't see the budget.

Receipts are logged by Claude: it reads the budget with `tools/data.mjs get`, adds the entries, and writes it back with `tools/data.mjs put`, which checks that every entry id is unique and that item amounts add up to the entry amount. `sync.js` then brings the change to every connected phone within a minute.

Until 26 November 2026 the budget was an encrypted file, `data.enc.json`, in this repo. It was moved to the private repo and removed from here; it is still in this repo's history.

## Versions and checks

This app follows the common system of all Gluminou apps: `sync.js`, `updates.js`, `.github/verify.mjs`, `.github/check-common.mjs` and `tools/release.mjs` are exact copies of the masters in [Gluminou/app-common](https://github.com/Gluminou/app-common).

```
node tools/release.mjs minor "What changed, in plain words"
```
