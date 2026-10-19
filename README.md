# Soroban Error Registry

**Open, human-written explanations for Soroban errors.**

When a Soroban call fails you get something like `Error(Contract, #1205)` or `Error(Storage, ExceededLimit)`. Debuggers such as [Erst](https://github.com/dotandev/hintents) and [soroban-diagnose](https://github.com/kaankacar/soroban-diagnose) can tell you *which* contract raised it, and sometimes the enum variant name (`InvalidHf`). Neither can tell a new developer or a wallet user what `InvalidHf` *means* or what to do about it. That knowledge lives in each protocol's source code and Discord.

This repo is that missing layer: a versioned, machine-readable dataset of what Soroban errors mean, why they happen and how to fix them. It is a data source, not another debugger, so any tool can use it: explorers, wallets, Erst, soroban-diagnose, AI agents.

```
$ npx soroban-explain "Error(Storage, ExceededLimit)"
Error(Storage, ExceededLimit) — Soroban host (protocol 28)
The contract touched a ledger entry that is not in the transaction's footprint.
...
How to fix:
  • Simulate and assemble the transaction (e.g. rpc.prepareTransaction) right before signing.
```

## What's inside

| Key | What | Entries | Pinned to |
|---|---|---|---|
| `stellar/host` | Host errors, `Error(<Type>, <Code>)`; same meaning in every contract | 16 | `rs-soroban-env` v28.0.2 (protocol 28) |
| `stellar/sac` | Stellar Asset Contract (every classic asset + XLM) and built-in account auth | 14 | `rs-soroban-env` v28.0.2 |
| `blend/v2/pool` | Blend v2 lending pool (all v2 pools) | 32 | the commit deployed on mainnet |
| `blend/v2/backstop` | Blend v2 backstop | 17 | the commit deployed on mainnet |
| `blend/v2/pool-factory` | Blend v2 pool factory | 3 | the commit deployed on mainnet |

**Verified against source.** Every file pins the exact upstream commit it describes. CI checks that each contract code and name matches the Rust enum, and that each quoted host message appears word for word in the host source.

**Mapped to mainnet.** The Blend files list the mainnet contract IDs and code (wasm) hashes taken from Blend's own deployment files and checked on-chain. Every Blend v2 pool shares one wasm hash, so any v2 pool resolves, including ones not listed by ID.

All entries start as `draft`. An entry becomes `reviewed` once someone other than its author has checked it against the source.

## The one thing to get right: who raised the error

- **Host errors** (`Error(Storage, …)`, `Error(Auth, …)`, `Error(Budget, …)` …) mean the same thing everywhere, so no contract is needed.
- **Contract errors** (`Error(Contract, #N)`) are numbers each contract defines for itself. Blend deliberately reuses the SAC's low codes, and inside a Blend transaction `Error(Contract, #10)` usually comes from the **token**, not the pool. Always look the code up under the contract that emitted it (the contract on the first `error` diagnostic event). The library never falls back to a guess.
- **Wrapped errors.** When a classic account's signatures fail, the top-level error is `Error(Auth, InvalidAction)`, and the real cause, `Error(Contract, #5)` from the account check, appears just before it in the diagnostic events. The entries link to each other with `see_also`.

## Use it

**CLI**
```bash
npx soroban-explain "Error(Auth, InvalidAction)"                       # host error
npx soroban-explain blend/v2/pool "Error(Contract, #1205)"             # by key
npx soroban-explain CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD 1205   # by contract ID
npx soroban-explain a41fc53d6753b6c04eb15b021c55052366a4c8e0e21bc72700f461264ec1350e 1205   # by wasm hash
npx soroban-explain --list
```

**Library**: no dependencies, works in browsers, bundlers, Deno, Bun and Node.
```js
import { explain } from "soroban-error-registry";

explain({ code: "Error(Storage, MissingValue)" });
explain({ wasmHash, code: "Error(Contract, #1220)" });
// → { name: "ExceededSupplyCap", summary, explanation, fixes, category, source, ... }
```
To resolve any Blend v2 pool, read the contract's wasm hash from its instance entry (e.g. `getLedgerEntries` on Stellar RPC), then pass `wasmHash`.

**Raw data**: `dist/registry.json` (or `dist/registry.mjs`) bundles everything, indexed by key, host `Type,Code`, contract ID and wasm hash.

## File format

- **Contract files**: `registry/<protocol>/[version/]<contract>.json`, validated by [`schema/protocol.schema.json`](schema/protocol.schema.json). Each error has `code` and `name` exactly as in the `#[contracterror]` enum, a one-line `summary` (≤140 chars) a wallet could show as-is, plus `explanation`, `common_causes`, `fixes`, a `category`, `raised_in_source: false` for variants that are declared but never raised, `mirrors` / `see_also` links, and `status`.
- **Host file**: `registry/stellar/host.json`, validated by [`schema/host.schema.json`](schema/host.schema.json). It is keyed by `type` + `code`. It quotes the exact diagnostic-event `messages` to look for, and lists the `source_files` they come from.

## Develop

```bash
npm install
npm run validate          # schema + consistency, offline
npm run validate:source   # also checks codes, names and host messages against the pinned source
npm run build             # writes dist/registry.json and dist/registry.mjs
npm test
```

## Contribute

New protocols, reviews and fixes are all welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and the [starter issues](docs/wave-issues.md).

## License

Code: MIT. Registry data (`registry/`, `dist/`): CC0 1.0, so anyone can embed it without attribution friction.
