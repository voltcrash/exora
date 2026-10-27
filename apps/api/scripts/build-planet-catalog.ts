import { readFile, writeFile } from "node:fs/promises";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";
import {
  compareCatalogNames,
  encodePlanetCatalog,
  type PlanetCatalogSnapshot,
} from "@exora/planet-catalog";
import { loadNasaPlanets, NASA_TAP_ENDPOINT, PLANET_CATALOG_QUERY } from "../src/nasa-archive.ts";

const OUTPUT_URL = new URL(
  "../../../packages/planet-catalog/data/pscomppars.json",
  import.meta.url,
);

// One planet per line keeps weekly refresh diffs reviewable.
const serialize = ({ rows, ...header }: PlanetCatalogSnapshot): string => {
  const head = JSON.stringify(header, null, 2).slice(0, -2);
  const body = rows.map((row) => `    ${JSON.stringify(row)}`).join(",\n");
  return `${head},\n  "rows": [\n${body}\n  ]\n}\n`;
};

const readPrevious = async (): Promise<PlanetCatalogSnapshot | null> => {
  try {
    return JSON.parse(
      new TextDecoder().decode(await readFile(OUTPUT_URL)),
    ) as PlanetCatalogSnapshot;
  } catch {
    return null;
  }
};

const planets = (await loadNasaPlanets(PLANET_CATALOG_QUERY, { timeoutMs: 180_000 })).sort(
  compareCatalogNames,
);
if (planets.length < 1_000) {
  throw new Error(`NASA returned only ${planets.length} planets; refusing to shrink the snapshot.`);
}

const metadata = { endpoint: NASA_TAP_ENDPOINT, query: PLANET_CATALOG_QUERY };
const previous = await readPrevious();
const fresh = serialize(
  encodePlanetCatalog(planets, { ...metadata, generatedAt: new Date().toISOString() }),
);
// Keep the previous timestamp when nothing else changed, so an unchanged archive yields no diff.
const output =
  previous &&
  serialize({ ...JSON.parse(fresh), generatedAt: previous.generatedAt }) === serialize(previous)
    ? serialize(previous)
    : fresh;

const bytes = new TextEncoder().encode(output);
const gzip = gzipSync(bytes, { level: 9 }).byteLength;
const brotli = brotliCompressSync(bytes, {
  params: { [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY },
}).byteLength;

await writeFile(OUTPUT_URL, output);
console.log(
  `[planet-catalog] ${planets.length} planets, ${bytes.byteLength} bytes raw, ${gzip} gzip, ${brotli} brotli` +
    (output === fresh ? "" : " (unchanged)"),
);
