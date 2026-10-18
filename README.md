# Soroban Error Registry

**Open, human-written explanations for Soroban contract errors.**

When a Soroban call fails you usually get something like `Error(Contract, #1205)`. Debuggers such as [Erst](https://github.com/dotandev/hintents) and [soroban-diagnose](https://github.com/kaankacar/soroban-diagnose) can tell you *which* contract raised it, and sometimes the enum variant name (`InvalidHf`). Neither can tell a new developer or a wallet user what `InvalidHf` *means* or what to do about it — that knowledge lives in each protocol's source code and Discord.

This repo is that missing layer: a versioned, machine-readable dataset of what each protocol's error codes mean, why they happen, and how to fix them. It is a data source, not another debugger, so any tool — explorers, wallets, Erst, soroban-diagnose, AI agents — can use it.

```
$ npx soroban-explain blend/v2/pool "Error(Contract, #1205)"
InvalidHf (#1205) — Blend v2 lending pool

This action would leave the position under-collateralised.
...
How to fix:
  • Borrow less, add collateral, or repay part of the loan first.
```

## What's inside

| Key | Contract | Codes | Source |
|---|---|---|---|
| `stellar/sac` | Stellar Asset Contract (every classic asset + XLM) | 14 | `rs-soroban-env` |
| `blend/v2/pool` | Blend v2 lending pool | 32 | `blend-contracts-v2` |
| `blend/v2/backstop` | Blend v2 backstop | 17 | `blend-contracts-v2` |
| `blend/v2/pool-factory` | Blend v2 pool factory | 3 | `blend-contracts-v2` |

Every file pins the exact upstream commit its codes come from, and CI checks that the codes and names still match that source.

All entries start as `draft`. An entry becomes `reviewed` once someone other than its author has checked it against the source.

## The one thing to get right: who raised the error

The same number means different things in different contracts. Blend deliberately reuses the SAC's low codes, and inside a Blend transaction `Error(Contract, #10)` usually comes from the **token**, not the pool. Always look up the code under the contract that emitted the error (the contract ID on the first `error` diagnostic event), never just the number. The library never falls back to a guess.

## Use it

**CLI**
```bash
npx soroban-explain stellar/sac 13
npx soroban-explain <C... contract id> 1205   # once deployments are mapped
npx soroban-explain --list
```

**Library**
```js
import { explain } from "soroban-error-registry";

const hit = explain({ key: "blend/v2/pool", code: "Error(Contract, #1220)" });
// → { name: "ExceededSupplyCap", summary, explanation, fixes, category, source, ... }
```
You can also look up by `contractId` or `wasmHash` when the contract's `deployments` are filled in.

**Raw JSON** — `dist/registry.json` bundles everything, indexed by key, contract ID and wasm hash.

## File format

One JSON file per contract under `registry/<protocol>/[version/]<contract>.json`, validated by [`schema/protocol.schema.json`](schema/protocol.schema.json). Each error has:

- `code`, `name` — exactly as in the Rust `#[contracterror]` enum
- `summary` — one line (≤140 chars) a wallet could show as-is
- `explanation`, `common_causes`, `fixes` — the human part
- `category` — `user-input`, `account-state`, `protocol-state`, `permissions`, `oracle`, `admin-config` or `internal`
- `raised_in_source: false` — for variants that are declared but never raised (e.g. Blend's SAC-parity codes)
- `mirrors` — when a code intentionally shares meaning with another entry, e.g. `stellar/sac#10`
- `status` / `reviewed_by`

## Develop

```bash
npm install
npm run validate          # schema + consistency, offline
npm run validate:source   # also checks codes against the pinned upstream source
npm run build             # writes dist/registry.json
npm test
```

## Contribute

New protocols, reviews and fixes are all welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [open issues](docs/wave-issues.md).

## License

Code: MIT. Registry data (`registry/`, `dist/`): CC0 1.0, so anyone can embed it without attribution friction.
