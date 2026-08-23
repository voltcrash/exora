#!/usr/bin/env node

/** Convert an archived PDS Cartesian vertex/plate table to OBJ without filling coverage gaps. */

import { readFileSync, writeFileSync } from "node:fs";

const [sourcePath, destinationPath] = process.argv.slice(2);
if (!sourcePath || !destinationPath) {
  throw new Error("Usage: convert-pds-cartesian-plate-to-obj.mjs <source.tab> <destination.obj>");
}

const records = readFileSync(sourcePath, "utf8")
  .trim()
  .split(/\r?\n/u)
  .map((line) => line.trim().split(/\s+/u));
const [vertexCount, plateCount] = records.shift().map(Number);
if (records.length !== vertexCount + plateCount) throw new Error("Unexpected PDS record count.");

const vertices = records.slice(0, vertexCount).map(([x, y, z]) => `v ${x} ${y} ${z}`);
const measuredPlates = records
  .slice(vertexCount)
  .flatMap(([a, b, c, coverageFlag]) =>
    Number(coverageFlag) === 0 ? [`f ${Number(a) + 1} ${Number(b) + 1} ${Number(c) + 1}`] : [],
  );

writeFileSync(
  destinationPath,
  [
    "# NASA PDS Cartesian plate model; only mission-derived coverage flag 0 is retained",
    `# source ${sourcePath}`,
    `# archived plates ${plateCount}; measured plates ${measuredPlates.length}`,
    ...vertices,
    ...measuredPlates,
    "",
  ].join("\n"),
  "utf8",
);
