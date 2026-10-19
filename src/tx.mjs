// Explain a failed transaction straight from Stellar RPC. Optional entry point:
// unlike the core library it needs @stellar/stellar-sdk, and the network.
//
//   import { explainTx } from "soroban-error-registry/tx";
//   const { status, errors } = await explainTx(hash, { rpcUrl: RPC_URLS.testnet });
//   errors[0];   // root cause: { error, contractId, message, key, hit, ... }

import { Contract, StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";
import { explain, resolveKey } from "./index.mjs";

/** Public RPC defaults. Mainnet has none: bring your own provider. */
export const RPC_URLS = { testnet: "https://soroban-testnet.stellar.org" };

const SAC_KEY = "stellar/sac";
// Host message when a require_auth() fails inside the account check (auth.rs).
const ACCOUNT_AUTH_FAILED = "failed account authentication with error";

async function rpc(rpcUrl, method, params, fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`${method}: RPC returned HTTP ${res.status}`);
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}

/** "sceAuth"/"scecInvalidAction" → "Error(Auth, InvalidAction)"; contract codes → "Error(Contract, #5)". */
function formatScError(e) {
  if (e.type === "sceContract") return `Error(Contract, #${e.contractCode})`;
  return `Error(${e.type.replace(/^sce/, "")}, ${e.code.name.replace(/^scec/, "")})`;
}

function diagnosticEvents(tx) {
  const b64 = tx.events?.diagnosticEventsXdr ?? tx.diagnosticEventsXdr;
  if (b64?.length) return b64.map((b) => xdr.DiagnosticEvent.fromXDR(b, "base64"));
  if (!tx.resultMetaXdr) return [];
  const meta = xdr.TransactionMeta.fromXDR(tx.resultMetaXdr, "base64");
  return meta.v4?.diagnosticEvents ?? meta.v3?.sorobanMeta?.diagnosticEvents ?? [];
}

/**
 * Every diagnostic event whose first topic is the symbol "error", in order.
 * @returns {{error:string, contractId:string|null, message:string|null, args:any[]}[]}
 */
export function errorEvents(tx) {
  const out = [];
  for (const { event } of diagnosticEvents(tx)) {
    const [first, second] = event.body.v0.topics;
    if (first?.type !== "scvSymbol" || new TextDecoder().decode(first.sym.bytes) !== "error") continue;
    if (second?.type !== "scvError") continue;
    const data = scValToNative(event.body.v0.data);
    const [message, ...args] = Array.isArray(data) ? data : [data];
    out.push({
      error: formatScError(second.error),
      contractId: event.contractId ? StrKey.encodeContract(event.contractId.value) : null,
      message: typeof message === "string" ? message : null,
      args,
    });
  }
  return out;
}

/**
 * Read each contract's instance entry. Stellar Asset Contracts have no wasm,
 * so they map to the "stellar/sac" key; others to their wasm hash.
 * @returns {Promise<Map<string, {key:string}|{wasmHash:string}>>} missing IDs have no live instance entry
 */
export async function contractExecutables(contractIds, { rpcUrl, fetch } = {}) {
  const found = new Map();
  if (!contractIds.length) return found;
  const keys = contractIds.map((id) => new Contract(id).getFootprint().toXDR("base64"));
  const { entries = [] } = await rpc(rpcUrl, "getLedgerEntries", { keys }, fetch);
  for (const entry of entries) {
    const id = contractIds[keys.indexOf(entry.key)];
    const exe = xdr.LedgerEntryData.fromXDR(entry.xdr, "base64").contractData?.val?.instance?.executable;
    if (!id || !exe) continue;
    if (exe.type === "contractExecutableStellarAsset") found.set(id, { key: SAC_KEY });
    else if (exe.type === "contractExecutableWasm") found.set(id, { wasmHash: [...exe.wasmHash.value].map((b) => b.toString(16).padStart(2, "0")).join("") });
  }
  return found;
}

function explainOne(ev, next, executable) {
  if (!ev.error.startsWith("Error(Contract")) return { key: null, hit: explain({ code: ev.error }) };
  // A classic account's signature check runs in the frame of whichever contract
  // called require_auth, so its error carries that contract's ID. The host
  // wraps it with the G-address, so the code is from the built-in enum.
  if (next?.error === "Error(Auth, InvalidAction)" && next.message === ACCOUNT_AUTH_FAILED
      && StrKey.isValidEd25519PublicKey(String(next.args[0]))) {
    return { key: SAC_KEY, via: "built-in account check", hit: explain({ key: SAC_KEY, code: ev.error }) };
  }
  const lookup = !ev.contractId ? null
    : resolveKey({ contractId: ev.contractId }) ? { contractId: ev.contractId }
    : executable ?? null;
  const key = lookup && resolveKey(lookup);
  return { key, hit: key ? explain({ ...lookup, code: ev.error }) : null };
}

/**
 * Fetch a transaction and explain every error in its diagnostic chain. The
 * first error is the root cause. For contract errors `key` is the registry
 * contract (null when unknown) and `hit` is null when it has no such code.
 */
export async function explainTx(hash, { rpcUrl, fetch } = {}) {
  if (!rpcUrl) throw new Error("explainTx needs an rpcUrl");
  const tx = await rpc(rpcUrl, "getTransaction", { hash }, fetch);
  if (tx.status !== "FAILED") return { hash, status: tx.status, errors: [] };

  const events = errorEvents(tx);
  const ids = [...new Set(events.map((e) => e.contractId).filter(Boolean))]
    .filter((id) => !resolveKey({ contractId: id }));
  const executables = await contractExecutables(ids, { rpcUrl, fetch });

  const errors = events.map((ev, i) => {
    const executable = executables.get(ev.contractId);
    return { ...ev, wasmHash: executable?.wasmHash ?? null, ...explainOne(ev, events[i + 1], executable) };
  });
  return { hash, status: tx.status, errors };
}
