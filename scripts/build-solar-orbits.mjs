import { readFile, writeFile, mkdir } from "node:fs/promises";

// Raw Horizons responses are kept outside the repository; rerun with that directory to reproduce.
const directory = process.argv[2];
if (!directory) throw new Error("Usage: vpx scripts/build-solar-orbits.mjs RAW_RESPONSE_DIRECTORY");
const names = [
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "Ceres",
  "Eris",
  "Haumea",
  "Makemake",
];
const read = async (name, kind) =>
  JSON.parse(await readFile(`${directory}/${name}-${kind}.json`, "utf8"));
const rows = (payload) => {
  if (
    payload.signature?.version !== "1.2" ||
    !payload.result.includes("Center body name: Sun (10)") ||
    !payload.result.includes("Ecliptic of J2000.0")
  )
    throw new Error("Unexpected Horizons frame or version");
  return payload.result
    .split("$$SOE")[1]
    .split("$$EOE")[0]
    .trim()
    .split("\n")
    .map((line) => {
      const fields = line.split(",");
      const values = [fields[0], ...fields.slice(2, 8)].map(Number);
      if (!values.every(Number.isFinite)) throw new Error("Invalid Horizons vector");
      return values.map((value) => Number(value.toPrecision(12)));
    });
};
const bodies = [];
const fixtures = [];
for (const name of names) {
  const anchors = await read(name, "anchors");
  const checks = await read(name, "fixtures");
  bodies.push({
    name,
    naifId: anchors.naifId,
    solution: anchors.result.match(/Target body name:.*\{source:\s*([^}]+)\}/)[1].trim(),
    sourceUrl: anchors.url,
    states: rows(anchors),
  });
  fixtures.push({ name, naifId: checks.naifId, sourceUrl: checks.url, states: rows(checks) });
}
await mkdir("apps/website/src/data", { recursive: true });
await writeFile("apps/website/src/data/solar-orbits.json", JSON.stringify(bodies));
await writeFile("apps/website/src/data/solar-orbits-fixtures.json", JSON.stringify(fixtures));
