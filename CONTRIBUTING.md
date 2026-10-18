# Contributing

Thanks for helping make Soroban errors readable. There are three kinds of contribution.

## 1. Review an existing entry (easiest)

1. Open the entry's file and the upstream source at the pinned commit (`source.repo` / `source.commit` / `source.path`).
2. Find where the error is raised (search for `panic_with_error!(e, PoolError::InvalidHf)` or similar).
3. Check that `summary`, `explanation` and `fixes` match what the code actually does. Fix anything wrong.
4. Set `"status": "reviewed"` and add your handle to `reviewed_by` (e.g. `["@yourname"]`).

You cannot review an entry you wrote.

## 2. Add a protocol or contract

1. Find the contract's `#[contracterror]` enum in its public repo and copy the full commit SHA.
2. Create `registry/<protocol>/[<version>/]<contract>.json`. The folder name must equal `protocol.id`, and the file name must equal `contract.id`.
3. Add **every** variant in the enum, sorted by code — CI fails on missing variants.
4. For each one, read where it is raised and write what it means for the person whose transaction failed. If a variant is never raised, set `"raised_in_source": false`.
5. Leave `status` as `"draft"`.
6. Run `npm run validate:source` before opening the PR.

## 3. Map deployments

Fill a contract's `deployments` with mainnet/testnet contract IDs or wasm hashes. **Every entry needs a `verified_by` link** to official docs, a release note, or the protocol's own deployment file — not just an explorer search result.

## Writing guidelines

- Write for the developer or user whose transaction just failed, not for the contract author.
- `summary` is one plain sentence a wallet could show as-is. No jargon you would not say out loud.
- `fixes` must be actions someone can take. If nothing in the transaction can fix it (stale oracle, protocol cap), say so.
- Only describe behaviour you can point to in the source. If you are unsure, leave it out and mention it in the PR.
- Do not copy large blocks of protocol documentation; link it under `references`.

## Checks CI runs

`npm run validate:source`, `npm run build`, `npm test`, and a check that `dist/registry.json` is up to date.
