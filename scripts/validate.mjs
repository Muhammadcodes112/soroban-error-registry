#!/usr/bin/env node
// Validates every registry file.
//   node scripts/validate.mjs                 schema + consistency checks (offline)
//   node scripts/validate.mjs --check-source  also checks the data against the pinned
//                                             upstream source (codes, names, host messages)
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ROOT, loadRegistry, keyOf, hostKey } from "./lib/load.mjs";
import { parseRustEnum } from "./lib/rust-enum.mjs";

const checkSource = process.argv.includes("--check-source");
const readSchema = async (name) => JSON.parse(await readFile(join(ROOT, "schema", name), "utf8"));

// strictRequired is off because the deployments anyOf uses required-only branches.
const ajv = new Ajv({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validators = {
  contract: ajv.compile(await readSchema("protocol.schema.json")),
  host: ajv.compile(await readSchema("host.schema.json")),
};

const files = await loadRegistry();
const problems = [];
const report = (path, msg) => problems.push(`${path}: ${msg}`);

// Every "<key>#<code>" so mirrors / see_also links can be resolved.
const refs = new Set();
for (const { path, data } of files) {
  for (const e of data.errors ?? []) {
    refs.add(`${keyOf(path)}#${data.kind === "host" ? hostKey(e) : e.code}`);
  }
}

const seenDeployments = new Map();
const sourceCache = new Map();

for (const { path, data } of files) {
  const kind = data.kind === "host" ? "host" : "contract";
  const validate = validators[kind];
  if (!validate(data)) {
    for (const err of validate.errors) report(path, `schema ${err.instancePath || "/"} ${err.message}`);
    continue;
  }
  if (keyOf(path).split("/")[0] !== data.protocol.id) {
    report(path, `top folder must match protocol.id "${data.protocol.id}"`);
  }

  if (kind === "host") checkHost(path, data);
  else checkContract(path, data);

  if (checkSource) {
    try {
      await (kind === "host" ? checkHostSource(path, data) : checkContractSource(path, data));
    } catch (err) {
      report(path, `source check failed: ${err.message}`);
    }
  }
}

function checkCommon(path, e, where) {
  for (const ref of [e.mirrors, ...(e.see_also ?? [])].filter(Boolean)) {
    if (!refs.has(ref)) report(path, `${where} links to unknown entry ${ref}`);
  }
  if (e.status === "reviewed" && !(e.reviewed_by?.length > 0)) report(path, `${where} is "reviewed" but has no reviewed_by`);
}

function checkContract(path, data) {
  if (keyOf(path).split("/").at(-1) !== data.contract.id) report(path, `file name must match contract.id "${data.contract.id}"`);
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
    checkCommon(path, e, where);
  }
  for (const d of data.deployments ?? []) {
    for (const id of [d.contract_id, d.wasm_hash].filter(Boolean)) {
      const other = seenDeployments.get(`${d.network}:${id}`);
      if (other && other !== path) report(path, `deployment ${id} is also claimed by ${other}`);
      seenDeployments.set(`${d.network}:${id}`, path);
    }
  }
}

function checkHost(path, data) {
  const seen = new Set();
  let last = "";
  for (const e of data.errors) {
    const k = hostKey(e);
    if (seen.has(k)) report(path, `duplicate host error ${k}`);
    seen.add(k);
    if (k < last) report(path, `${k} is out of order; keep host errors sorted by type, then code`);
    last = k;
    checkCommon(path, e, k);
  }
}

async function fetchSource(repo, commit, file) {
  const m = repo.match(/^https:\/\/github\.com\/([^/]+\/[^/]+?)(\.git)?\/?$/);
  if (!m) throw new Error(`only GitHub repos are supported (got ${repo})`);
  const url = `https://raw.githubusercontent.com/${m[1]}/${commit}/${file}`;
  if (!sourceCache.has(url)) {
    sourceCache.set(url, fetch(url).then(async (res) => {
      if (!res.ok) throw new Error(`could not fetch ${url} (HTTP ${res.status})`);
      return res.text();
    }));
  }
  return sourceCache.get(url);
}

/** Compare our codes/names with the named #[contracterror] enum at the pinned commit. */
async function checkContractSource(path, data) {
  const { repo, commit, path: srcPath, enum: enumName } = data.source;
  const upstream = parseRustEnum(await fetchSource(repo, commit, srcPath), enumName);
  for (const e of data.errors) {
    if (!upstream.has(e.name)) report(path, `${e.name} not found in upstream ${enumName ?? "enum"}`);
    else if (upstream.get(e.name) !== e.code) report(path, `${e.name} is #${upstream.get(e.name)} upstream, #${e.code} here`);
  }
  const ours = new Set(data.errors.map((e) => e.name));
  for (const name of upstream.keys()) {
    if (!ours.has(name) && !name.startsWith("_")) report(path, `upstream variant ${name} is missing from this file`);
  }
}

/** Every listed host message must appear verbatim in one of the entry's source files. */
async function checkHostSource(path, data) {
  const { repo, commit } = data.source;
  for (const e of data.errors) {
    const texts = await Promise.all(e.source_files.map((f) => fetchSource(repo, commit, f)));
    const all = texts.join("\n");
    for (const msg of e.messages ?? []) {
      if (!all.includes(msg)) report(path, `${hostKey(e)}: message "${msg}" not found in ${e.source_files.join(", ")}`);
    }
    for (const token of [`ScErrorType::${e.type}`, `ScErrorCode::${e.code}`]) {
      if (!all.includes(token)) report(path, `${hostKey(e)}: ${token} not found in ${e.source_files.join(", ")}`);
    }
  }
}

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n  ${problems.join("\n  ")}`);
  process.exit(1);
}
const total = files.reduce((n, f) => n + f.data.errors.length, 0);
console.log(`✓ ${files.length} files, ${total} errors valid${checkSource ? " (matches pinned upstream source)" : ""}`);
