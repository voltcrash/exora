#!/usr/bin/env node

/**
 * Convert a PDS Gaskell vertex/plate table into a browser-ready OBJ.
 *
 * The first record declares the archived vertex and triangular-plate counts. Subsequent records
 * contain indexed Cartesian vertices followed by indexed plates. Conversion preserves every
 * coordinate and plate index; it does not smooth, interpolate, decimate, or invent geometry.
 */

import { readFileSync, writeFileSync } from "node:fs";

const [sourcePath, destinationPath] = process.argv.slice(2);
if (!sourcePath || !destinationPath) {
  throw new Error("Usage: convert-pds-vertex-plate-to-obj.mjs <source.tab> <destination.obj>");
}

const records = readFileSync(sourcePath, "utf8")
  .trim()
  .split(/\r?\n/u)
  .map((line) => line.trim().split(/\s+/u));
const [vertexCount, plateCount] = records.shift().map(Number);
if (!Number.isInteger(vertexCount) || !Number.isInteger(plateCount)) {
  throw new Error("The first record must declare integer vertex and plate counts.");
}
if (records.length !== vertexCount + plateCount) {
  throw new Error(`Expected ${vertexCount + plateCount} records, received ${records.length}.`);
}

const vertices = records.slice(0, vertexCount).map(([index, x, y, z], offset) => {
  if (Number(index) !== offset + 1 || [x, y, z].some((value) => !Number.isFinite(Number(value)))) {
    throw new Error(`Invalid vertex record ${offset + 1}.`);
  }
  return `v ${x} ${y} ${z}`;
});
const plates = records.slice(vertexCount).map(([index, a, b, c], offset) => {
  if (Number(index) !== offset + 1 || [a, b, c].some((value) => !Number.isInteger(Number(value)))) {
    throw new Error(`Invalid plate record ${offset + 1}.`);
  }
  return `f ${a} ${b} ${c}`;
});

writeFileSync(
  destinationPath,
  [
    "# Plate-preserving conversion from a NASA PDS Gaskell vertex/plate table",
    `# source ${sourcePath}`,
    ...vertices,
    ...plates,
    "",
  ].join("\n"),
  "utf8",
);
