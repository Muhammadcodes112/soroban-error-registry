#!/usr/bin/env node
// Validates every registry file.
//   node scripts/validate.mjs                 schema + consistency checks (offline)
//   node scripts/validate.mjs --check-source  also compares codes/names with the
//                                             upstream Rust enum at the pinned commit
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ROOT, loadRegistry, keyOf } from "./lib/load.mjs";

const checkSource = process.argv.includes("--check-source");
const schema = JSON.parse(await readFile(join(ROOT, "schema/protocol.schema.json"), "utf8"));
// strictRequired is off because the deployments anyOf uses required-only branches.
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

const files = await loadRegistry();
const problems = [];
const report = (path, msg) => problems.push(`${path}: ${msg}`);

// Index of every key#code so `mirrors` links can be resolved.
const allCodes = new Set();
for (const { path, data } of files) {
  for (const e of data.errors ?? []) allCodes.add(`${keyOf(path)}#${e.code}`);
}

for (const { path, data } of files) {
  if (!validateSchema(data)) {
    for (const err of validateSchema.errors) report(path, `schema ${err.instancePath || "/"} ${err.message}`);
    continue;
  }

  const parts = keyOf(path).split("/");
  if (parts[0] !== data.protocol.id) report(path, `folder "${parts[0]}" must match protocol.id "${data.protocol.id}"`);
  if (parts.at(-1) !== data.contract.id) report(path, `file name must match contract.id "${data.contract.id}"`);

  const codes = new Set();
  const names = new Set();
  let last = 0;
  for (const e of data.errors) {
    const where = `${e.name} (#${e.code})`;
    if (codes.has(e.code)) report(path, `duplicate code #${e.code}`);
    if (names.has(e.name)) report(path, `duplicate name ${e.name}`);
    codes.add(e.code);
    names.add(e.name);
    if (e.code < last) report(path, `${where} is out of order; keep errors sorted by code`);
    last = e.code;
    if (e.mirrors && !allCodes.has(e.mirrors)) report(path, `${where} mirrors unknown entry ${e.mirrors}`);
    if (e.status === "reviewed" && !(e.reviewed_by?.length > 0)) report(path, `${where} is "reviewed" but has no reviewed_by`);
  }

  if (checkSource) await compareWithSource(path, data);
}

/** Fetch the pinned Rust source and compare `Variant = N` pairs. GitHub repos only. */
async function compareWithSource(path, data) {
  const { repo, commit, path: srcPath } = data.source;
  const m = repo.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(\.git)?\/?$/);
  if (!m) return report(path, `--check-source only supports GitHub repos (got ${repo})`);
  const url = `https://raw.githubusercontent.com/${m[1]}/${commit}/${srcPath}`;
  const res = await fetch(url);
  if (!res.ok) return report(path, `could not fetch ${url} (HTTP ${res.status})`);
  const text = (await res.text()).replace(/\/\/.*$/gm, "");

  const upstream = new Map();
  for (const [, name, code] of text.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*,/gm)) {
    upstream.set(name, Number(code));
  }
  for (const e of data.errors) {
    if (!upstream.has(e.name)) report(path, `${e.name} not found in upstream ${srcPath}`);
    else if (upstream.get(e.name) !== e.code) report(path, `${e.name} is #${upstream.get(e.name)} upstream, #${e.code} here`);
  }
  const ours = new Set(data.errors.map((e) => e.name));
  for (const name of upstream.keys()) {
    if (!ours.has(name) && !name.startsWith("_")) report(path, `upstream variant ${name} is missing from this file`);
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
const total = files.reduce((n, f) => n + f.data.errors.length, 0);
console.log(`✓ ${files.length} files, ${total} errors valid${checkSource ? " (codes match upstream source)" : ""}`);
