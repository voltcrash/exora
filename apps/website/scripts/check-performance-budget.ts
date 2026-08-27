import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import {
  budgetViolations,
  DEFAULT_JAVASCRIPT_BUDGET,
  type EmittedJavaScript,
} from "../src/performance-budget.ts";

const dist = resolve(import.meta.dirname, "../dist");
const assets = join(dist, "assets");
const html = new TextDecoder().decode(await readFile(join(dist, "index.html")));
const initialPaths = new Set(
  [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="\/([^"]+\.js)"/g)].flatMap((match) =>
    match[1] ? [match[1]] : [],
  ),
);

const emitted: EmittedJavaScript[] = await Promise.all(
  (await readdir(assets))
    .filter((file) => file.endsWith(".js"))
    .map(async (file) => {
      const path = join(assets, file);
      return { bytes: (await stat(path)).size, path: relative(dist, path) };
    }),
);

const initialBytes = emitted
  .filter((artifact) => initialPaths.has(artifact.path))
  .reduce((total, artifact) => total + artifact.bytes, 0);
const largest = emitted.reduce((current, artifact) =>
  artifact.bytes > current.bytes ? artifact : current,
);

console.log(
  `[performance] emitted initial JavaScript: ${initialBytes.toLocaleString("en-US")} bytes across ${initialPaths.size} files`,
);
console.log(
  `[performance] largest emitted JavaScript: ${largest.path} (${largest.bytes.toLocaleString("en-US")} bytes)`,
);

const violations = budgetViolations(emitted, initialPaths);
if (violations.length > 0) {
  throw new Error(violations.join("\n"));
}

console.log(
  `[performance] budgets passed (initial ≤ ${DEFAULT_JAVASCRIPT_BUDGET.initialBytes.toLocaleString("en-US")}, file ≤ ${DEFAULT_JAVASCRIPT_BUDGET.largestFileBytes.toLocaleString("en-US")})`,
);
