import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { explain, parseError, parseCode, listKeys, listHostErrors } from "../src/index.mjs";

test("parseError reads the formats developers paste", () => {
  assert.deepEqual(parseError(13), { kind: "contract", code: 13 });
  assert.deepEqual(parseError("#13"), { kind: "contract", code: 13 });
  assert.deepEqual(parseError("Error(Contract, #1205)"), { kind: "contract", code: 1205 });
  assert.deepEqual(parseError("HostError: Error(Storage, MissingValue)"), { kind: "host", type: "Storage", code: "MissingValue" });
  assert.equal(parseCode("Error(Contract, #7)"), 7);
  assert.throws(() => parseError("nonsense"));
});

test("host errors resolve without a contract", () => {
  const hit = explain({ code: "Error(Auth, InvalidAction)" });
  assert.equal(hit.kind, "host");
  assert.ok(hit.messages.includes("Unauthorized function call for address"));
  assert.equal(explain({ code: "Error(Events, ArithDomain)" }), null);
});

test("contract errors resolve by key", () => {
  assert.equal(explain({ key: "stellar/sac", code: "Error(Contract, #13)" }).name, "TrustlineMissingError");
  assert.equal(explain({ key: "blend/v2/pool", code: 1205 }).name, "InvalidHf");
});

test("any Blend v2 pool resolves by its shared wasm hash", () => {
  const hit = explain({ wasmHash: "a41fc53d6753b6c04eb15b021c55052366a4c8e0e21bc72700f461264ec1350e", code: 1220 });
  assert.equal(hit.key, "blend/v2/pool");
  assert.equal(hit.name, "ExceededSupplyCap");
});

test("known mainnet contract IDs resolve", () => {
  assert.equal(explain({ contractId: "CAJJZSGMMM3PD7N33TAPHGBUGTB43OC73HVIK2L2G6BNGGGYOSSYBXBD", code: 1205 }).key, "blend/v2/pool");
  assert.equal(explain({ contractId: "CAQQR5SWBXKIGZKPBZDH3KM5GQ5GUTPKB7JAFCINLZBC5WXPJKRG3IM7", code: 1001 }).name, "NotExpired");
});

test("never guesses for unknown contracts or codes", () => {
  assert.equal(explain({ key: "nope/x", code: 1 }), null);
  assert.equal(explain({ contractId: "C" + "A".repeat(55), code: 1 }), null);
  assert.equal(explain({ key: "blend/v2/pool", code: 9999 }), null);
  assert.equal(explain({ code: 1205 }), null, "a bare contract code needs a contract");
});

test("ships the seed data", () => {
  assert.deepEqual(listKeys().sort(), ["blend/v2/backstop", "blend/v2/pool", "blend/v2/pool-factory", "stellar/sac"]);
  assert.ok(listHostErrors().length >= 15);
});

test("library is browser-safe: no Node built-ins", async () => {
  for (const f of ["../src/index.mjs", "../dist/registry.mjs"]) {
    const src = await readFile(new URL(f, import.meta.url), "utf8");
    assert.doesNotMatch(src, /from\s+["']node:|require\(/, `${f} must not import Node modules`);
  }
});
