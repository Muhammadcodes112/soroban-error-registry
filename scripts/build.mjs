#!/usr/bin/env node
// Bundles registry/ into dist/registry.json — the single file tools consume.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { ROOT, loadRegistry, keyOf } from "./lib/load.mjs";

const files = await loadRegistry();
const contracts = {};
const byContractId = {};
const byWasmHash = {};

for (const { path, data } of files) {
  const key = keyOf(path);
  contracts[key] = {
    protocol: data.protocol,
    contract: data.contract,
    source: data.source,
    errors: Object.fromEntries(data.errors.map((e) => [e.code, e])),
  };
  for (const d of data.deployments ?? []) {
    if (d.contract_id) byContractId[d.contract_id] = key;
    if (d.wasm_hash) byWasmHash[d.wasm_hash] = key;
  }
}

// Deterministic output (no timestamp) so CI can check that dist/ is up to date.
const bundle = { schema_version: 1, contracts, byContractId, byWasmHash };
await mkdir(join(ROOT, "dist"), { recursive: true });
await writeFile(join(ROOT, "dist/registry.json"), JSON.stringify(bundle, null, 2) + "\n");
console.log(`✓ dist/registry.json — ${Object.keys(contracts).length} contracts`);
