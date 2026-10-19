#!/usr/bin/env node
// Usage:
//   soroban-explain "Error(Storage, MissingValue)"            host errors need no contract
//   soroban-explain <key|contract-id|wasm-hash> <code>
//   soroban-explain blend/v2/pool "Error(Contract, #1205)"
//   soroban-explain --list
import { explain, listKeys, listHostErrors } from "../src/index.mjs";

const args = process.argv.slice(2);
const USAGE = `usage: soroban-explain "Error(<Type>, <Code>)"
       soroban-explain <key|contract-id|wasm-hash> <code>   (e.g. blend/v2/pool 1205)
       soroban-explain --list`;

if (args[0] === "--list") {
  console.log(`Contracts:\n  ${listKeys().join("\n  ")}\n\nHost errors:\n  ${listHostErrors().join("\n  ")}`);
  process.exit(0);
}
if (args.length === 0) {
  console.error(USAGE);
  process.exit(2);
}

// A lone error ("Error(Storage, MissingValue)", possibly split by the shell) has no target.
const errorOnly = args.length === 1 || args[0].startsWith("Error(");
const target = errorOnly ? null : args[0];
const input = (errorOnly ? args : args.slice(1)).join(" ");
const lookup = !target ? {}
  : /^C[A-Z2-7]{55}$/.test(target) ? { contractId: target }
  : /^[0-9a-f]{64}$/i.test(target) ? { wasmHash: target }
  : { key: target };

let hit;
try {
  hit = explain({ ...lookup, code: input });
} catch (err) {
  console.error(`${err.message}\n\n${USAGE}`);
  process.exit(2);
}

if (!hit) {
  const what = Object.values(lookup)[0];
  console.error(
    what
      ? `No entry for ${what} ${input}. Run --list to see known contracts, or add one — see CONTRIBUTING.md.`
      : `No entry for ${input}. Contract errors need a contract: soroban-explain <key|contract-id> ${input}`,
  );
  process.exit(1);
}

const title = hit.kind === "host"
  ? `Error(${hit.type}, ${hit.code}) — Soroban host (protocol ${hit.network_protocol})`
  : `${hit.name} (#${hit.code}) — ${hit.contract}`;
const sourceUrl = hit.kind === "host"
  ? `${hit.source.repo}/tree/${hit.source.tag ?? hit.source.commit}`
  : `${hit.source.repo}/blob/${hit.source.commit}/${hit.source.path}`;

const list = (label, items) => items?.length && `\n${label}:\n${items.map((i) => `  • ${i}`).join("\n")}`;
const lines = [
  title,
  "",
  hit.summary,
  hit.explanation && `\n${hit.explanation}`,
  hit.messages?.length && `\nLook for these messages in the diagnostic events:\n${hit.messages.map((m) => `  "${m}"`).join("\n")}`,
  list("Common causes", hit.common_causes),
  list("How to fix", hit.fixes),
  hit.raised_in_source === false && "\nNote: this code is declared but never raised by this contract's source — check which contract actually emitted it.",
  hit.mirrors && `Same meaning as ${hit.mirrors}.`,
  hit.see_also?.length && `See also: ${hit.see_also.join(", ")}`,
  hit.references?.length && `\nRead more:\n${hit.references.map((r) => `  ${r.title}: ${r.url}`).join("\n")}`,
  `\nSource: ${sourceUrl}`,
  hit.status === "draft" ? "Status: draft (not yet reviewed)" : `Reviewed by ${hit.reviewed_by.join(", ")}`,
];
console.log(lines.filter(Boolean).join("\n"));
