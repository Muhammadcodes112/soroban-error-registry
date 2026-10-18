import { test } from "node:test";
import assert from "node:assert/strict";
import { explain, parseCode, listKeys } from "../src/index.mjs";

test("parseCode accepts the formats developers paste", () => {
  assert.equal(parseCode(13), 13);
  assert.equal(parseCode("13"), 13);
  assert.equal(parseCode("#13"), 13);
  assert.equal(parseCode("Error(Contract, #1205)"), 1205);
});

test("explains a SAC trustline error", () => {
  const hit = explain({ key: "stellar/sac", code: "Error(Contract, #13)" });
  assert.equal(hit.name, "TrustlineMissingError");
});

test("explains a Blend pool health-factor error", () => {
  const hit = explain({ key: "blend/v2/pool", code: 1205 });
  assert.equal(hit.name, "InvalidHf");
  assert.equal(hit.category, "account-state");
});

test("never guesses for unknown contracts or codes", () => {
  assert.equal(explain({ key: "nope/x", code: 1 }), null);
  assert.equal(explain({ contractId: "C" + "A".repeat(55), code: 1 }), null);
  assert.equal(explain({ key: "blend/v2/pool", code: 9999 }), null);
});

test("ships the seed contracts", () => {
  assert.deepEqual(listKeys().sort(), ["blend/v2/backstop", "blend/v2/pool", "blend/v2/pool-factory", "stellar/sac"]);
});
