import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { StrKey, xdr } from "@stellar/stellar-sdk";
import { explainTx, errorEvents, contractExecutables } from "../src/tx.mjs";
import { explain } from "../src/index.mjs";

const fixture = async (name) => JSON.parse(await readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
const wrapped = await fixture("tx-auth-wrapped.testnet.json");
const instances = await fixture("instances.mainnet.json");
const recorded = (fx, method) => fx.calls.find((c) => c.method === method);

const NATIVE_SAC_TESTNET = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const BLEND_POOL = "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD";

/** Serves recorded JSON-RPC responses; anything else fails the test. Never touches the network. */
function fakeFetch(calls) {
  const seen = [];
  const fetch = async (url, init) => {
    const { method, params } = JSON.parse(init.body);
    const call = calls.find((c) => c.method === method);
    assert.ok(call, `unexpected RPC call ${method}`);
    if (call.params) assert.deepEqual(params, call.params, `${method} params`);
    seen.push(method);
    return new Response(JSON.stringify(call.response));
  };
  return { fetch, seen };
}

/** The recorded getTransaction with its diagnostic events edited. */
function editEvents(edit) {
  const call = recorded(wrapped, "getTransaction");
  const events = call.response.result.diagnosticEventsXdr.map((b) => xdr.DiagnosticEvent.fromXDR(b, "base64"));
  const result = { ...call.response.result, diagnosticEventsXdr: edit(events).map((e) => e.toXDR("base64")) };
  return { method: "getTransaction", response: { ...call.response, result } };
}

const setContract = (event, id) => { event.event.contractId.value = StrKey.decodeContract(id); return event; };
const isErrorEvent = (e) => {
  const [first] = e.event.body.v0.topics;
  return first?.type === "scvSymbol" && new TextDecoder().decode(first.sym.bytes) === "error";
};

test("wrapped auth failure: Error(Contract, #5) is the root cause, then Error(Auth, InvalidAction)", async () => {
  const { fetch, seen } = fakeFetch(wrapped.calls);
  const { status, errors } = await explainTx(wrapped.hash, { rpcUrl: wrapped.rpcUrl, fetch });

  assert.equal(status, "FAILED");
  assert.deepEqual(seen, ["getTransaction", "getLedgerEntries"]);
  assert.deepEqual(errors.map((e) => e.error), ["Error(Contract, #5)", "Error(Auth, InvalidAction)"]);

  const [root, wrapper] = errors;
  assert.equal(root.contractId, NATIVE_SAC_TESTNET);
  assert.equal(root.message, "signer does not belong to account");
  assert.equal(root.key, "stellar/sac");
  assert.equal(root.hit.name, "AuthenticationError");

  assert.equal(wrapper.contractId, NATIVE_SAC_TESTNET);
  assert.equal(wrapper.message, "failed account authentication with error");
  assert.equal(wrapper.hit.key, "stellar/host#Auth,InvalidAction");
});

test("diagnostic events are read from the tx meta when the response has none", () => {
  const result = { ...recorded(wrapped, "getTransaction").response.result };
  const fromResponse = errorEvents(result);
  delete result.diagnosticEventsXdr;
  assert.deepEqual(errorEvents(result), fromResponse);
});

test("a classic account's #5 is the built-in code even when a wasm contract called require_auth", async () => {
  // The host tags the account check's error with the calling contract's ID.
  // Blend pools have no #5, so a lookup by contract would wrongly find nothing.
  const tx = editEvents((events) => events.map((e) => (isErrorEvent(e) ? setContract(e, BLEND_POOL) : e)));
  const { fetch, seen } = fakeFetch([tx]);
  const { errors } = await explainTx(wrapped.hash, { rpcUrl: wrapped.rpcUrl, fetch });

  assert.deepEqual(seen, ["getTransaction"], "known contract IDs need no ledger read");
  assert.equal(errors[0].contractId, BLEND_POOL);
  assert.equal(errors[0].key, "stellar/sac");
  assert.equal(errors[0].via, "built-in account check");
  assert.equal(errors[0].hit.name, "AuthenticationError");
});

test("an unknown contract's error is not explained with another contract's codes", async () => {
  const unknown = StrKey.encodeContract(new Uint8Array(32).fill(7));
  // Keep only the #5 event, re-tagged to a contract the registry doesn't know.
  const tx = editEvents((events) => [setContract(events.find(isErrorEvent), unknown)]);
  const { fetch } = fakeFetch([tx, { method: "getLedgerEntries", response: { jsonrpc: "2.0", id: 1, result: { entries: [], latestLedger: 1 } } }]);
  const { errors } = await explainTx(wrapped.hash, { rpcUrl: wrapped.rpcUrl, fetch });

  assert.equal(errors.length, 1);
  assert.equal(errors[0].error, "Error(Contract, #5)");
  assert.equal(errors[0].key, null);
  assert.equal(errors[0].hit, null);
});

test("a transaction that didn't fail has nothing to explain", async () => {
  const call = recorded(wrapped, "getTransaction");
  const ok = { method: "getTransaction", response: { ...call.response, result: { ...call.response.result, status: "SUCCESS" } } };
  const { fetch, seen } = fakeFetch([ok]);
  assert.deepEqual(await explainTx(wrapped.hash, { rpcUrl: wrapped.rpcUrl, fetch }), { hash: wrapped.hash, status: "SUCCESS", errors: [] });
  assert.deepEqual(seen, ["getTransaction"]);
});

test("instance entries map a Blend pool to its wasm hash and a SAC to stellar/sac", async () => {
  const { fetch } = fakeFetch(instances.calls);
  const found = await contractExecutables(instances.contractIds, { rpcUrl: instances.rpcUrl, fetch });
  const [pool, sac] = instances.contractIds;

  assert.deepEqual(found.get(pool), { wasmHash: "a41fc53d6753b6c04eb15b021c55052366a4c8e0e21bc72700f461264ec1350e" });
  assert.equal(explain({ ...found.get(pool), code: 1205 }).key, "blend/v2/pool");
  assert.deepEqual(found.get(sac), { key: "stellar/sac" });
});

test("CLI: mainnet has no default RPC and says so", async () => {
  const bin = new URL("../bin/explain.mjs", import.meta.url);
  const env = { ...process.env };
  delete env.SOROBAN_RPC_URL;
  await assert.rejects(
    promisify(execFile)(process.execPath, [bin.pathname.replace(/^\/(\w:)/, "$1"), "tx", wrapped.hash, "--network", "mainnet"], { env }),
    (err) => err.code === 2 && /no default public RPC for mainnet.*--rpc <url>.*SOROBAN_RPC_URL/s.test(err.stderr),
  );
});
