import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRustEnum } from "../scripts/lib/rust-enum.mjs";

const TWO_ENUMS = `
#[contracterror]
#[repr(u32)]
pub enum RouterError {
    // a comment = 99,
    NotInitialized = 1,
    /* Deadline = 50, */
    DeadlineExpired = 2,
}

#[contracterror]
#[repr(u32)]
pub enum PairError { NotInitialized = 101, InsufficientLiquidity = 102 }
`;

test("reads only the named enum", () => {
  assert.deepEqual([...parseRustEnum(TWO_ENUMS, "RouterError")], [["NotInitialized", 1], ["DeadlineExpired", 2]]);
  assert.deepEqual([...parseRustEnum(TWO_ENUMS, "PairError")], [["NotInitialized", 101], ["InsufficientLiquidity", 102]]);
});

test("ignores commented-out variants", () => {
  const v = parseRustEnum(TWO_ENUMS, "RouterError");
  assert.equal(v.has("a"), false);
  assert.equal(v.has("Deadline"), false);
});

test("throws when the enum is missing", () => {
  assert.throws(() => parseRustEnum(TWO_ENUMS, "FactoryError"), /not found/);
});
