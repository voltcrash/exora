#!/usr/bin/env node

/**
 * Normalize whitespace in an archived PDS OBJ without changing its vertices or plate indices.
 *
 * Babylon's browser OBJ parser rejects the fixed-width `f` records used by several PDS products.
 * This browser-compatibility pass changes only whitespace on `v`, `vn`, `vt`, and `f` records.
 */

import { readFileSync, writeFileSync } from "node:fs";

const paths = process.argv.slice(2);
if (paths.length === 0) throw new Error("Usage: normalize-pds-obj.mjs <model.obj> [...]");

for (const path of paths) {
  const normalized = readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map((line) => {
      const trimmed = line.trim();
      return /^(?:f|v|vn|vt)\s/u.test(trimmed) ? trimmed.split(/\s+/u).join(" ") : line;
    })
    .join("\n");
  writeFileSync(path, normalized, "utf8");
}
