#!/usr/bin/env node

/** Convert the coordinate and triangular-index records of a PDS VRML 2 shape product to OBJ. */

import { readFileSync, writeFileSync } from "node:fs";

const [sourcePath, destinationPath] = process.argv.slice(2);
if (!sourcePath || !destinationPath) {
  throw new Error("Usage: convert-pds-vrml-to-obj.mjs <source.wrl> <destination.obj>");
}

const source = readFileSync(sourcePath, "utf8");
const declared = source.match(/Number of vertices and number of facets:\s*#\s*(\d+)\s+(\d+)/u);
const pointStart = source.indexOf("point [");
const pointEnd = source.indexOf("]", pointStart);
const faceStart = source.indexOf("coordIndex [", pointEnd);
const faceEnd = source.indexOf("]", faceStart);
if (!declared || pointStart < 0 || pointEnd < 0 || faceStart < 0 || faceEnd < 0) {
  throw new Error("The VRML product does not contain the expected PDS shape sections.");
}

const coordinates = source
  .slice(pointStart + "point [".length, pointEnd)
  .split(/\r?\n/u)
  .map((line) => line.replace(/#.*/u, "").trim())
  .filter(Boolean)
  .map((line) => `v ${line.split(/\s+/u).slice(0, 3).join(" ")}`);
const faces = source
  .slice(faceStart + "coordIndex [".length, faceEnd)
  .split(/\r?\n/u)
  .map((line) => line.replace(/#.*/u, "").trim())
  .filter(Boolean)
  .map((line) =>
    line
      .match(/\d+/gu)
      ?.slice(0, 3)
      .map((index) => Number(index) + 1),
  )
  .filter((indices) => indices?.length === 3)
  .map((indices) => `f ${indices.join(" ")}`);
const [vertexCount, faceCount] = declared.slice(1).map(Number);
if (coordinates.length !== vertexCount || faces.length !== faceCount) {
  throw new Error(
    `Converted ${coordinates.length}/${vertexCount} vertices and ${faces.length}/${faceCount} faces.`,
  );
}

writeFileSync(
  destinationPath,
  [
    "# Plate-preserving conversion from a NASA PDS VRML 2 shape model",
    `# source ${sourcePath}`,
    ...coordinates,
    ...faces,
    "",
  ].join("\n"),
  "utf8",
);
