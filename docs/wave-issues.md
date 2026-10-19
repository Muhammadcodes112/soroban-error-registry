# Starter issues

Ready to paste into GitHub Issues for Drips Wave. Each one is scoped so a single contributor can finish it in one PR. Complexity labels follow the usual trivial / medium / high split.

---

## Trivial

### 1. Review SAC entries #2–#9
Check `registry/stellar/sac.json` codes 2–9 against `soroban-env-host/src/builtin_contracts/` at the pinned commit (v28.0.2). Each entry quotes the host messages, so search for them. Correct the text where needed, then mark the entries `reviewed`.
**Done when:** the entries are `reviewed` with your handle, and CI passes.

### 2. Review SAC entries #10–#15
Same as #1 for codes 10–15. `BalanceError` (#10) has the most raise sites, so trace every one of them.

### 3. Review host entries: Auth, Budget, Context, Crypto
Check each entry in `registry/stellar/host.json` against `rs-soroban-env` v28.0.2. Bonus: reproduce one on testnet and add the transaction hash to the PR.

### 4. Review host entries: Object, Storage, Value, WasmVm
Same as #3 for the remaining host entries.

### 5. Review Blend v2 pool entries #1200–#1212
Trace each `panic_with_error!` in `blend-contracts-v2/pool/src` at the pinned commit and confirm the explanation. Mark them reviewed.

### 6. Review Blend v2 pool entries #1213–#1224
Same as #5 for the remaining pool codes.

### 7. Review Blend v2 backstop and pool-factory entries
Covers `backstop.json` and `pool-factory.json`.

---

## Medium

### 8. Add Blend v1
v1 pools are still live on mainnet. Add `registry/blend/v1/{pool,backstop,pool-factory}.json` from `blend-contracts` at the deployed commit. The v1 wasm hashes are already listed in blend-utils' `mainnet.contracts.json`.

### 9. Add Soroswap (router, pair, factory)
Add `registry/soroswap/…` from the `soroswap/core` error enums, explain every variant, and map the mainnet deployments.

### 10. Add Aquarius AMM
Add the Aquarius pool and router error enums.

### 11. Add the Reflector oracle
Oracle failures show up inside lending and DEX transactions, so explaining them helps across protocols.

### 12. Add OpenZeppelin Stellar contracts (fungible token, access control, pausable)
Many new tokens are built on these, so one file covers many deployed contracts. Map each module's error enum to its own file.

### 13. Add DeFindex vaults and strategies

### 14. More host errors
Add the next most common host errors not covered yet, for example `Value,UnexpectedType`, `Object,UnexpectedSize` and `WasmVm,IndexBounds`. Every message must pass `validate:source`.

### 15. Static lookup page on GitHub Pages
A single page where someone pastes an error (and a contract key, ID or wasm hash for contract errors) and sees the explanation. Import `src/index.mjs` directly; no backend needed.

### 16. Publish to npm with a release workflow
Publish on tag, attach `dist/registry.json` to the GitHub release, and document a stable raw URL.

---

## High

### 17. `soroban-explain tx <hash>`
Fetch a failed transaction from Stellar RPC, find the first `error` diagnostic event and the contract that emitted it, read that contract's wasm hash from its instance entry, and explain every error in the chain, including wrapped ones like `Error(Auth, InvalidAction)` → `Error(Contract, #5)`. Keep it in a separate optional entry point so the core library stays dependency-free.

### 18. Generate skeleton files from a deployed wasm
`npm run scaffold -- <contract-id> --network mainnet` should fetch the contract's wasm, read the `contractspecv0` section, and write a draft registry file with every error name, code and doc comment filled in. A human then writes the explanations.

### 19. Integrate with Erst
Open a PR to [dotandev/hintents](https://github.com/dotandev/hintents) that loads `dist/registry.json`, so Erst's suggestion output shows registry explanations for host errors and known contracts. Link the PR here.

### 20. Integrate with soroban-diagnose
Same as #19 for soroban-diagnose: after it resolves `Error(Contract, #N)` to a variant name, attach the registry's summary and fixes.

### 21. MCP server
Expose `explain` as an MCP tool, so AI coding agents can look up Soroban errors while debugging.
