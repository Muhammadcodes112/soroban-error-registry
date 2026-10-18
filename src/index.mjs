// Tiny lookup library over dist/registry.json. No dependencies.
//
//   import { explain } from "soroban-error-registry";
//   explain({ key: "blend/v2/pool", code: 1205 });
//   explain({ contractId: "C...", code: "Error(Contract, #1205)" });

import { readFileSync } from "node:fs";

let cached;
function bundle() {
  cached ??= JSON.parse(readFileSync(new URL("../dist/registry.json", import.meta.url), "utf8"));
  return cached;
}

/** Accepts 1205, "1205", "#1205" or "Error(Contract, #1205)". */
export function parseCode(input) {
  if (typeof input === "number") return input;
  const m = String(input).match(/#?\s*(\d+)\s*\)?\s*$/);
  if (!m) throw new Error(`Cannot read an error code from "${input}"`);
  return Number(m[1]);
}

/** Resolve a registry key from a key, contract ID or wasm hash. */
export function resolveKey({ key, contractId, wasmHash }) {
  const b = bundle();
  if (key) return b.contracts[key] ? key : null;
  if (contractId) return b.byContractId[contractId] ?? null;
  if (wasmHash) return b.byWasmHash[wasmHash] ?? null;
  return null;
}

/**
 * Explain a contract error. Returns null when the contract or code is unknown.
 * Never guesses: an unknown contract does not fall back to another protocol's codes.
 */
export function explain({ key, contractId, wasmHash, code }) {
  const k = resolveKey({ key, contractId, wasmHash });
  if (!k) return null;
  const c = bundle().contracts[k];
  const entry = c.errors[parseCode(code)];
  if (!entry) return null;
  return { key: k, protocol: c.protocol.name, contract: c.contract.name, source: c.source, ...entry };
}

export function listKeys() {
  return Object.keys(bundle().contracts);
}
