#!/usr/bin/env node
// Usage:
//   soroban-explain "Error(Storage, MissingValue)"            host errors need no contract
//   soroban-explain <key|contract-id|wasm-hash> <code>
//   soroban-explain blend/v2/pool "Error(Contract, #1205)"
//   soroban-explain tx <hash> [--network mainnet|testnet] [--rpc <url>]   needs @stellar/stellar-sdk
//   soroban-explain --list
import { explain, listKeys, listHostErrors } from "../src/index.mjs";

const args = process.argv.slice(2);
const USAGE = `usage: soroban-explain "Error(<Type>, <Code>)"
       soroban-explain <key|contract-id|wasm-hash> <code>   (e.g. blend/v2/pool 1205)
       soroban-explain tx <hash> [--network mainnet|testnet] [--rpc <url>]
       soroban-explain --list`;

// `tx` returns its exit code instead of calling process.exit(): exiting while
// fetch's socket is still closing crashes Node on Windows.
if (args[0] === "tx") process.exitCode = await explainTxCommand(args.slice(1));
else explainCode(args);

function explainCode(args) {
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

  console.log(render(hit));
}

function render(hit) {
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
  return lines.filter(Boolean).join("\n");
}

async function explainTxCommand(argv) {
  const opts = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--network" || argv[i] === "--rpc") opts[argv[i].slice(2)] = argv[++i];
    else positional.push(argv[i]);
  }
  const [hash] = positional;
  const network = opts.network ?? "testnet";
  if (positional.length !== 1 || !/^[0-9a-f]{64}$/i.test(hash) || !["mainnet", "testnet"].includes(network)) {
    console.error(USAGE);
    return 2;
  }

  // Loaded lazily: only `tx` needs @stellar/stellar-sdk.
  let tx;
  try {
    tx = await import("../src/tx.mjs");
  } catch (err) {
    if (err.code !== "ERR_MODULE_NOT_FOUND") throw err;
    console.error(`soroban-explain tx needs @stellar/stellar-sdk. Install it next to this package:
  npm install @stellar/stellar-sdk
or run: npx -p soroban-error-registry -p @stellar/stellar-sdk soroban-explain tx ${hash}`);
    return 2;
  }

  const rpcUrl = opts.rpc ?? process.env.SOROBAN_RPC_URL ?? tx.RPC_URLS[network];
  if (!rpcUrl) {
    console.error(`There is no default public RPC for ${network}. Pass --rpc <url> or set SOROBAN_RPC_URL.`);
    return 2;
  }

  let result;
  try {
    result = await tx.explainTx(hash, { rpcUrl });
  } catch (err) {
    console.error(`Could not fetch ${hash} from ${rpcUrl}: ${err.message}`);
    return 1;
  }
  if (result.status === "NOT_FOUND") {
    console.error(`Transaction ${hash} was not found on ${rpcUrl}. Check the network; RPC only keeps recent history.`);
    return 1;
  }
  if (result.status !== "FAILED") {
    console.log(`Transaction ${hash} did not fail (status: ${result.status}). Nothing to explain.`);
    return 0;
  }
  if (!result.errors.length) {
    console.log(`Transaction ${hash} failed, but has no "error" diagnostic events. It may have failed before any contract ran, or this RPC does not record diagnostic events.`);
    return 0;
  }

  console.log(`Transaction ${hash} failed with ${result.errors.length} error event(s). The first is the root cause.\n`);
  result.errors.forEach((e, i) => {
    const from = e.contractId ? `from ${e.contractId}` : "from the host, outside any contract";
    const contract = e.key ? ` (${e.key}${e.via ? `, ${e.via}` : ""})` : e.wasmHash ? ` (wasm ${e.wasmHash})` : "";
    const body = e.hit ? render(e.hit)
      : e.error.startsWith("Error(Contract") && !e.key
        ? `This contract is not in the registry, so ${e.error} can't be explained here. Contract error codes are per contract, so another contract's meaning for the same number would be a guess. To add it, see CONTRIBUTING.md.`
        : `No registry entry for ${e.error}${e.key ? ` in ${e.key}` : ""}. To add one, see CONTRIBUTING.md.`;
    console.log([
      "=".repeat(72),
      `${i === 0 ? "Root cause" : `Then (${i + 1})`}: ${e.error} ${from}${contract}`,
      `Diagnostic message: ${e.message ? `"${e.message}"` : "(none)"}`,
      "",
      body,
      "",
    ].join("\n"));
  });
  return 0;
}
