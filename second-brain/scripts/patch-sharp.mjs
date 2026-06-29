// transformers.js (v2) eagerly imports `sharp`, whose native binary we don't
// install (text embeddings never use it). Replace its native entry with a
// harmless no-op proxy so `import` succeeds. Idempotent; safe if sharp absent.
import { existsSync, writeFileSync } from "node:fs";

const target = new URL("../node_modules/sharp/lib/sharp.js", import.meta.url).pathname;
if (!existsSync(target)) {
  console.log("patch-sharp: sharp not installed, nothing to do");
  process.exit(0);
}
writeFileSync(
  target,
  `'use strict';\n` +
    `// Stub written by scripts/patch-sharp.mjs — native sharp is unused (text only).\n` +
    `const noop = () => undefined;\n` +
    `const handler = { get: () => proxy, apply: () => proxy, construct: () => proxy };\n` +
    `const proxy = new Proxy(noop, handler);\n` +
    `module.exports = proxy;\n`,
);
console.log("patch-sharp: wrote no-op sharp stub");
