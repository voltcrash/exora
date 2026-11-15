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
if (process.argv.includes("--download")) {
  await mkdir(directory, { recursive: true });
  for (const [kind, file] of [
    ["anchors", "solar-orbits.json"],
    ["fixtures", "solar-orbits-fixtures.json"],
  ]) {
    const sources = JSON.parse(await readFile(`apps/website/src/data/${file}`, "utf8"));
    for (const source of sources) {
      const response = await fetch(source.sourceUrl);
      if (!response.ok) throw new Error(`Horizons returned ${response.status} for ${source.name}`);
      const payload = await response.json();
      rows(payload);
      await writeFile(
        `${directory}/${source.name}-${kind}.json`,
        JSON.stringify({
          ...payload,
          name: source.name,
          naifId: source.naifId,
          url: source.sourceUrl,
        }),
      );
    }
  }
}
const bodies = [];
const fixtures = [];
for (const name of names) {
  const anchors = await read(name, "anchors");
  const checks = await read(name, "fixtures");
  bodies.push({
    name,
    naifId: anchors.naifId,
    anchorTarget: anchors.result.match(/Target body name:\s*([^\n{]+)/)[1].trim(),
    solution: anchors.result.match(/Target body name:.*\{source:\s*([^}]+)\}/)[1].trim(),
    sourceUrl: anchors.url,
    states: rows(anchors),
  });
  fixtures.push({ name, naifId: checks.naifId, sourceUrl: checks.url, states: rows(checks) });
}
await mkdir("apps/website/src/data", { recursive: true });
await writeFile("apps/website/src/data/solar-orbits.json", JSON.stringify(bodies));
await writeFile("apps/website/src/data/solar-orbits-fixtures.json", JSON.stringify(fixtures));
