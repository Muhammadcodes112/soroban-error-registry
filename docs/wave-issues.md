# Starter issues

Ready to paste into GitHub Issues for Drips Wave. Each one is scoped so a single contributor can finish it in one PR. Complexity labels follow the usual trivial / medium / high split.

---

## Trivial

### 1. Review SAC entries #2–#7
Check `registry/stellar/sac.json` codes 2–7 against `soroban-env-host/src/builtin_contracts/stellar_asset_contract/` at the pinned commit. Correct the text where needed, then mark them `reviewed`.
**Done when:** six entries are `reviewed` with your handle, and CI passes.

### 2. Review SAC entries #8–#15
Same as #1 for codes 8–15. Pay special attention to #10 (`BalanceError`): confirm whether exceeding a trustline limit also raises it.

### 3. Review Blend v2 pool entries #1200–#1212
Trace each `panic_with_error!` in `blend-contracts-v2/pool/src` and confirm the explanation. Mark them reviewed.

### 4. Review Blend v2 pool entries #1213–#1224
Same as #3 for the remaining pool codes.

### 5. Review Blend v2 backstop and pool-factory entries
Covers `backstop.json` and `pool-factory.json`.

---

## Medium

### 6. Map Blend v2 mainnet deployments
Fill `deployments` for the pool factory, the backstop, and the main v2 pools (or their shared pool wasm hash). Each entry needs a `verified_by` link to Blend's official docs or deployment files.
**Done when:** `soroban-explain <mainnet pool contract id> 1205` resolves.

### 7. Add Soroswap (router, pair, factory)
Add `registry/soroswap/…` from the `soroswap/core` repo error enums, with every variant explained.

### 8. Add Aquarius AMM
Add the Aquarius pool and router error enums.

### 9. Add the Reflector oracle
Oracle failures show up inside lending and DEX transactions, so explaining them helps across protocols.

### 10. Add OpenZeppelin Stellar contracts (fungible token, access control, pausable)
Many new tokens are built on these, so one file covers many deployed contracts. Map each module's error enum to its own file.

### 11. Add DeFindex vaults and strategies

### 12. Scope `--check-source` to the named enum
`scripts/validate.mjs` currently collects every `Name = N,` line in the source file. That breaks when one file defines several enums. Use `source.enum` to parse only the matching `pub enum <Name> { … }` block, and add tests for a file with two enums.

### 13. Static lookup page on GitHub Pages
A single page where someone pastes a contract key (or contract ID) and a code and sees the explanation. It should build from `dist/registry.json` with no backend.

### 14. Publish to npm with a release workflow
Publish on tag, attach `dist/registry.json` to the GitHub release, and document a stable raw URL.

---

## High

### 15. Generate skeleton files from a deployed wasm
`npm run scaffold -- <contract-id> --network mainnet` should fetch the contract's wasm, read the `contractspecv0` section, and write a draft registry file with every error name, code and doc comment filled in. A human then writes the explanations. This makes adding new protocols much faster.

### 16. Host-error layer (`Error(Storage, MissingValue)`, `Error(Auth, InvalidAction)`, `Error(Budget, ExceededLimit)` …)
Design a schema extension for host errors (type + code instead of contract + code), and add a `stellar/host` file. Discuss the design in the issue before writing code.

### 17. Integrate with Erst
Open a PR to [dotandev/hintents](https://github.com/dotandev/hintents) that loads `dist/registry.json` so Erst's suggestion output shows registry explanations for known contracts. Link the PR here.

### 18. Integrate with soroban-diagnose
Same as #17 for soroban-diagnose: after it resolves `Error(Contract, #N)` to a variant name, attach the registry's summary and fixes.
