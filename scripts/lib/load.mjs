import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const REGISTRY_DIR = join(ROOT, "registry");

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(p)));
    else if (entry.name.endsWith(".json")) out.push(p);
  }
  return out.sort();
}

/** Load every registry file as { path, data }. */
export async function loadRegistry() {
  const files = await walk(REGISTRY_DIR);
  return Promise.all(
    files.map(async (file) => ({
      path: relative(ROOT, file),
      data: JSON.parse(await readFile(file, "utf8")),
    })),
  );
}

/** Lookup key = file path under registry/ without .json, e.g. "blend/v2/pool". */
export const keyOf = (path) =>
  path.replace(/\\/g, "/").replace(/^registry\//, "").replace(/\.json$/, "");
