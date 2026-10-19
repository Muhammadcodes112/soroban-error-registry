#!/usr/bin/env node
// Opens one GitHub issue per "### N. Title" section in docs/wave-issues.md.
// Needs the GitHub CLI (gh), logged in, run from inside the repo.
//   node scripts/create-issues.mjs --dry-run   # preview
//   node scripts/create-issues.mjs             # create
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");
const md = readFileSync(new URL("../docs/wave-issues.md", import.meta.url), "utf8");

const issues = [];
let level = null;
for (const block of md.split(/^(?=## |### )/m)) {
  const section = block.match(/^## (Trivial|Medium|High)/);
  if (section) { level = section[1].toLowerCase(); continue; }
  const m = block.match(/^### \d+\.\s+(.+)\n([\s\S]*)/);
  if (!m || !level) continue;
  const body = m[2].replace(/\n---\s*$/, "").trim() || m[1];
  issues.push({ title: m[1].trim(), body, labels: [level, "Stellar Wave"] });
}

const labels = [
  ["trivial", "0e8a16"], ["medium", "fbca04"], ["high", "d93f0b"], ["Stellar Wave", "5319e7"],
];
if (!dryRun) {
  for (const [name, color] of labels) {
    try { execFileSync("gh", ["label", "create", name, "--color", color, "--force"], { stdio: "ignore" }); } catch {}
  }
}

for (const i of issues) {
  if (dryRun) { console.log(`[${i.labels[0]}] ${i.title}`); continue; }
  const url = execFileSync("gh", ["issue", "create", "--title", i.title, "--body", i.body,
    ...i.labels.flatMap((l) => ["--label", l])], { encoding: "utf8" }).trim();
  console.log(`✓ ${url}`);
}
console.log(`${dryRun ? "Would create" : "Created"} ${issues.length} issues.`);
