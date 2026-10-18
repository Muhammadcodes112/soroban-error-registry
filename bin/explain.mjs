#!/usr/bin/env node
// Usage:
//   soroban-explain <key|contract-id> <code>
//   soroban-explain blend/v2/pool 1205
//   soroban-explain stellar/sac "Error(Contract, #13)"
//   soroban-explain --list
import { explain, listKeys } from "../src/index.mjs";

const [target, ...rest] = process.argv.slice(2);

if (target === "--list") {
  console.log(listKeys().join("\n"));
  process.exit(0);
}
if (!target || rest.length === 0) {
  console.error('usage: soroban-explain <key|contract-id> <code>   (e.g. blend/v2/pool 1205)\n       soroban-explain --list');
  process.exit(2);
}

const code = rest.join(" ");
const lookup = /^C[A-Z2-7]{55}$/.test(target) ? { contractId: target } : { key: target };
const hit = explain({ ...lookup, code });

if (!hit) {
  console.error(`No entry for ${target} ${code}. Run --list to see known contracts, or add one — see CONTRIBUTING.md.`);
  process.exit(1);
}

const lines = [
  `${hit.name} (#${hit.code}) — ${hit.contract}`,
  "",
  hit.summary,
  hit.explanation && `\n${hit.explanation}`,
  hit.common_causes?.length && `\nCommon causes:\n${hit.common_causes.map((c) => `  • ${c}`).join("\n")}`,
  `\nHow to fix:\n${hit.fixes.map((f) => `  • ${f}`).join("\n")}`,
  hit.raised_in_source === false && "\nNote: this code is declared but never raised by this contract's source — check which contract actually emitted it.",
  hit.mirrors && `Same meaning as ${hit.mirrors}.`,
  hit.references?.length && `\nRead more:\n${hit.references.map((r) => `  ${r.title}: ${r.url}`).join("\n")}`,
  `\nSource: ${hit.source.repo}/blob/${hit.source.commit}/${hit.source.path}`,
  hit.status === "draft" ? "Status: draft (not yet reviewed)" : `Reviewed by ${hit.reviewed_by.join(", ")}`,
];
console.log(lines.filter(Boolean).join("\n"));
