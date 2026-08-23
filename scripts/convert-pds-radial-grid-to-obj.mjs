#!/usr/bin/env node

/**
 * Convert a PDS Small Bodies Node latitude/longitude/radius table into an OBJ plate model.
 *
 * The conversion preserves every archived radius sample. It only performs the documented
 * spherical-to-Cartesian coordinate transform and joins adjacent samples into triangles; it does
 * not smooth, interpolate, decimate, or invent vertices. Longitude wraps at the final column.
 */

import { readFileSync, writeFileSync } from "node:fs";

const [sourcePath, destinationPath] = process.argv.slice(2);
if (!sourcePath || !destinationPath) {
  throw new Error("Usage: convert-pds-radial-grid-to-obj.mjs <source.tab> <destination.obj>");
}

const samples = readFileSync(sourcePath, "utf8")
  .trim()
  .split(/\r?\n/u)
  .map((line) => line.trim().split(/\s+/u).map(Number));

const latitudes = [...new Set(samples.map(([latitude]) => latitude))];
const longitudes = [...new Set(samples.map(([, longitude]) => longitude))].sort(
  (left, right) => left - right,
);
if (samples.length !== latitudes.length * longitudes.length) {
  throw new Error("Input is not a complete regular latitude/longitude radius grid.");
}

const radii = new Map(
  samples.map(([latitude, longitude, radius]) => [`${latitude}:${longitude}`, radius]),
);
const vertices = [];
for (const latitude of latitudes) {
  const phi = (latitude * Math.PI) / 180;
  for (const longitude of longitudes) {
    const theta = (longitude * Math.PI) / 180;
    const radius = radii.get(`${latitude}:${longitude}`);
    vertices.push([
      radius * Math.cos(phi) * Math.cos(theta),
      radius * Math.sin(phi),
      radius * Math.cos(phi) * Math.sin(theta),
    ]);
  }
}

const faces = [];
const width = longitudes.length;
for (let row = 0; row < latitudes.length - 1; row += 1) {
  for (let column = 0; column < width; column += 1) {
    const next = (column + 1) % width;
    const upperLeft = row * width + column + 1;
    const upperRight = row * width + next + 1;
    const lowerLeft = (row + 1) * width + column + 1;
    const lowerRight = (row + 1) * width + next + 1;
    faces.push([upperLeft, lowerLeft, upperRight], [upperRight, lowerLeft, lowerRight]);
  }
}

const output = [
  "# Plate-preserving conversion from a NASA PDS latitude/longitude/radius table",
  `# source ${sourcePath}`,
  ...vertices.map(([x, y, z]) => `v ${x.toFixed(8)} ${y.toFixed(8)} ${z.toFixed(8)}`),
  ...faces.map(([a, b, c]) => `f ${a} ${b} ${c}`),
  "",
].join("\n");
writeFileSync(destinationPath, output, "utf8");
