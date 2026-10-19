// Lookup library over the bundled registry. No dependencies, no filesystem
// access: works in browsers, bundlers, Deno, Bun and Node.
//
//   import { explain } from "soroban-error-registry";
//   explain({ code: "Error(Storage, MissingValue)" });                 // host error, no contract needed
//   explain({ key: "blend/v2/pool", code: "Error(Contract, #1205)" });
//   explain({ wasmHash: "a41fc5...", code: 1205 });                    // any Blend v2 pool
//   explain({ contractId: "CAJJ...", code: 1205 });

import bundle from "../dist/registry.mjs";

export { bundle as registry };

const HOST_RE = /Error\(\s*([A-Za-z]+)\s*,\s*([A-Za-z]+)\s*\)/;
const CONTRACT_RE = /#?\s*(\d+)\s*\)?\s*$/;

/**
 * Parse what a developer pastes.
 * @returns {{kind:"host", type:string, code:string} | {kind:"contract", code:number}}
 */
export function parseError(input) {
  if (typeof input === "number") return { kind: "contract", code: input };
  const s = String(input).trim();
  const host = s.match(HOST_RE);
  if (host && host[1] !== "Contract") return { kind: "host", type: host[1], code: host[2] };
  const c = s.match(CONTRACT_RE);
  if (c) return { kind: "contract", code: Number(c[1]) };
  throw new Error(`Cannot read an error from "${input}"`);
}

/** Back-compat: numeric code only. */
export function parseCode(input) {
  const p = parseError(input);
  if (p.kind !== "contract") throw new Error(`"${input}" is a host error, not a contract error code`);
  return p.code;
}

/** Resolve a registry key from a key, contract ID or wasm hash. */
export function resolveKey({ key, contractId, wasmHash } = {}) {
  if (key) return bundle.contracts[key] ? key : null;
  if (contractId && bundle.byContractId[contractId]) return bundle.byContractId[contractId];
  if (wasmHash) return bundle.byWasmHash[wasmHash.toLowerCase()] ?? null;
  return null;
}

/** Explain a host error such as Error(Storage, MissingValue). */
export function explainHost(type, code) {
  const e = bundle.host[`${type},${code}`];
  return e ? { kind: "host", key: `stellar/host#${type},${code}`, ...e } : null;
}

/**
 * Explain an error. Host errors need no contract; contract errors need a key,
 * contract ID or wasm hash. Returns null when unknown — it never falls back to
 * another protocol's codes.
 */
export function explain({ key, contractId, wasmHash, code } = {}) {
  const parsed = parseError(code);
  if (parsed.kind === "host") return explainHost(parsed.type, parsed.code);
  const k = resolveKey({ key, contractId, wasmHash });
  if (!k) return null;
  const c = bundle.contracts[k];
  const entry = c.errors[parsed.code];
  if (!entry) return null;
  return { kind: "contract", key: k, protocol: c.protocol.name, contract: c.contract.name, source: c.source, ...entry };
}

export function listKeys() {
  return Object.keys(bundle.contracts);
}

export function listHostErrors() {
  return Object.keys(bundle.host);
}
