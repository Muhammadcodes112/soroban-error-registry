/**
 * Parse `Variant = N` pairs from a Rust enum.
 * When `enumName` is given, only that enum's body is read, so files that
 * define several enums are handled correctly.
 * @returns {Map<string, number>}
 */
export function parseRustEnum(source, enumName) {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  let body = text;
  if (enumName) {
    const start = text.search(new RegExp(`\\benum\\s+${enumName}\\s*\\{`));
    if (start === -1) throw new Error(`enum ${enumName} not found`);
    const open = text.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (; end < text.length; end++) {
      if (text[end] === "{") depth++;
      else if (text[end] === "}" && --depth === 0) break;
    }
    body = text.slice(open + 1, end);
  }
  const variants = new Map();
  for (const [, name, code] of body.matchAll(/(?:^|[\s,{])([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*(?=,|$|\s*\})/gm)) {
    variants.set(name, Number(code));
  }
  return variants;
}
