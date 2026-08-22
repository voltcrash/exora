/**
 * Turns the published HYG star database into the compact binary the renderer reads.
 *
 * The sky Exora draws around a destination is the real one, so the star positions behind it have
 * to come from a catalogue rather than from a noise function. HYG is that catalogue: a merge of
 * Hipparcos, the Yale Bright Star Catalog and Gliese, published as one CSV with a distance for
 * every star whose parallax is good enough to invert.
 *
 * The published file is 34 MB of CSV covering 119,614 stars, almost all of them far below the
 * naked-eye limit. What the renderer needs is five numbers each for the ~8,900 stars a person
 * could actually see, so this script does the filtering once, here, and commits the result. The
 * browser then downloads 139 KB of typed arrays it can map straight onto a vertex buffer instead
 * of parsing a JSON document several times that size.
 *
 * Nothing is computed or invented on the way through: every value written is a column HYG
 * publishes, and a star missing any one of them is dropped rather than filled in.
 *
 *   node scripts/build-star-catalog.ts [--source <hyg_v44.csv[.gz]>]
 *
 * Run it through `vp run website#star-catalog`. With no `--source` it downloads the pinned
 * release; the digest below is checked either way, so a changed upstream file fails loudly
 * instead of silently rewriting the sky.
 */

import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argv } from "node:process";
import { gunzipSync } from "node:zlib";

/**
 * HYG v4.4, the current release, fetched through Codeberg's LFS media endpoint — the plain `raw`
 * URL answers with the LFS pointer file rather than the catalogue.
 */
const SOURCE_URL =
  "https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz";
const SOURCE_SHA256 = "00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d";

/**
 * The naked-eye limit under a dark sky, and the same cut the renderer applies again once it has
 * recomputed each magnitude for the viewer's own distance.
 */
const MAGNITUDE_LIMIT = 6.5;

/**
 * HYG's marker for a star whose parallax is missing, negative, or too small to inverting into a
 * distance: `dist` is set to 100000 pc rather than left blank. Those stars keep their direction
 * and lose their distance — see `NO_PARALLAX_DISTANCE` in `sky-catalog.ts`.
 */
const HYG_UNKNOWN_DISTANCE_PARSECS = 100_000;

const OUTPUT_URL = new URL("../public/sky/hyg-v44-vmag65.bin", import.meta.url);

/** `EXSK`, little-endian, so a truncated or mistyped asset is rejected before it is read. */
const MAGIC = 0x4b_53_58_45;
const FORMAT_VERSION = 1;
const HEADER_BYTES = 16;

interface CatalogueStar {
  colourIndex: number;
  declinationRadians: number;
  /** Parsecs, or 0 for a star HYG could not place — see `HYG_UNKNOWN_DISTANCE_PARSECS`. */
  distanceParsecs: number;
  rightAscensionRadians: number;
  visualMagnitude: number;
}

/**
 * A CSV reader that understands quoting, because HYG uses it.
 *
 * Splitting on commas is enough for most of the file and wrong for the rest: `spect` carries
 * values like `"F5V:+..."` and the name columns are quoted throughout, so a naive split shifts
 * every later column on those rows and would quietly read a spectral type as a magnitude.
 */
const parseCsvLine = (line: string): string[] => {
  const fields: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];

    if (quoted) {
      if (character !== '"') {
        field += character;
      } else if (line[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (character === '"') quoted = true;
    else if (character === ",") {
      fields.push(field);
      field = "";
    } else field += character;
  }

  fields.push(field);
  return fields;
};

const numberOrNull = (value: string | undefined): number | null => {
  if (value === undefined || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

interface SelectionCounts {
  droppedNoColourIndex: number;
  droppedNoParallax: number;
  rows: number;
  selected: number;
}

const selectStars = (csv: string): { counts: SelectionCounts; stars: CatalogueStar[] } => {
  const lines = csv.split("\n");
  const header = parseCsvLine(lines[0] ?? "");
  const columnOf = (name: string): number => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`HYG source is missing the '${name}' column.`);
    return index;
  };

  const identifierColumn = columnOf("id");
  // The radian columns rather than `ra`/`dec`: HYG publishes both, and these are the ones it
  // states to full precision, so reading them avoids re-deriving a number the file already has.
  const rightAscensionColumn = columnOf("rarad");
  const declinationColumn = columnOf("decrad");
  const distanceColumn = columnOf("dist");
  const magnitudeColumn = columnOf("mag");
  const colourIndexColumn = columnOf("ci");

  const stars: CatalogueStar[] = [];
  const counts: SelectionCounts = {
    droppedNoColourIndex: 0,
    droppedNoParallax: 0,
    rows: 0,
    selected: 0,
  };

  for (let line = 1; line < lines.length; line += 1) {
    const text = lines[line];
    if (!text) continue;
    counts.rows += 1;

    const fields = parseCsvLine(text);

    // Row zero is the Sun, which HYG carries at distance zero with a right ascension and
    // declination of zero because it has no direction to record. It is the origin of the
    // coordinate frame, not a star in anybody's sky, and at magnitude -26.7 it would otherwise
    // sail through the cut below and be drawn on the infinity shell at the vernal equinox.
    if (fields[identifierColumn] === "0") continue;

    const visualMagnitude = numberOrNull(fields[magnitudeColumn]);
    if (visualMagnitude === null || visualMagnitude > MAGNITUDE_LIMIT) continue;

    const rightAscensionRadians = numberOrNull(fields[rightAscensionColumn]);
    const declinationRadians = numberOrNull(fields[declinationColumn]);
    if (rightAscensionRadians === null || declinationRadians === null) continue;

    // A star with no colour index has no colour this renderer is entitled to draw. Painting it
    // white would be indistinguishable from a real A0 star, so it leaves the catalogue instead.
    const colourIndex = numberOrNull(fields[colourIndexColumn]);
    if (colourIndex === null) {
      counts.droppedNoColourIndex += 1;
      continue;
    }

    const publishedDistance = numberOrNull(fields[distanceColumn]);
    const hasParallax =
      publishedDistance !== null &&
      publishedDistance > 0 &&
      publishedDistance < HYG_UNKNOWN_DISTANCE_PARSECS;
    if (!hasParallax) counts.droppedNoParallax += 1;

    stars.push({
      colourIndex,
      declinationRadians,
      distanceParsecs: hasParallax ? publishedDistance : 0,
      rightAscensionRadians,
      visualMagnitude,
    });
    counts.selected += 1;
  }

  // Brightest first. The order is free — nothing downstream depends on it — and it costs about
  // 10 KB off the compressed asset, because a monotonic magnitude column is nearly all runs.
  stars.sort(
    (left, right) =>
      left.visualMagnitude - right.visualMagnitude ||
      left.rightAscensionRadians - right.rightAscensionRadians,
  );

  return { counts, stars };
};

/**
 * Packs the selection as a header followed by five parallel arrays.
 *
 * Struct-of-arrays rather than interleaved records, so the browser can wrap each column in one
 * typed-array view over the downloaded buffer with no copying and no per-star object.
 *
 * Magnitude and colour index are the two columns HYG states to three decimals, so they ship as
 * thousandths in an `Int16Array` — exact for every value in the file, at half the width of a
 * float. Right ascension, declination and distance keep full `Float32Array` precision: at 8,880
 * stars the four extra bytes each are worth more than the argument about how few of them matter.
 */
const packCatalogue = (stars: readonly CatalogueStar[]): Uint8Array => {
  const count = stars.length;
  const bytes = new Uint8Array(HEADER_BYTES + count * 16);
  const view = new DataView(bytes.buffer);

  view.setUint32(0, MAGIC, true);
  view.setUint16(4, FORMAT_VERSION, true);
  view.setUint16(6, 0, true);
  view.setUint32(8, count, true);
  view.setFloat32(12, MAGNITUDE_LIMIT, true);

  const rightAscension = new Float32Array(bytes.buffer, HEADER_BYTES, count);
  const declination = new Float32Array(bytes.buffer, HEADER_BYTES + count * 4, count);
  const distance = new Float32Array(bytes.buffer, HEADER_BYTES + count * 8, count);
  const magnitude = new Int16Array(bytes.buffer, HEADER_BYTES + count * 12, count);
  const colourIndex = new Int16Array(bytes.buffer, HEADER_BYTES + count * 14, count);

  for (let index = 0; index < count; index += 1) {
    const star = stars[index];
    rightAscension[index] = star.rightAscensionRadians;
    declination[index] = star.declinationRadians;
    distance[index] = star.distanceParsecs;
    magnitude[index] = Math.round(star.visualMagnitude * 1_000);
    colourIndex[index] = Math.round(star.colourIndex * 1_000);
  }

  return bytes;
};

const readSource = async (): Promise<Uint8Array> => {
  const flag = argv.indexOf("--source");
  if (flag >= 0) {
    const path = argv[flag + 1];
    if (!path) throw new Error("--source needs a path to the HYG CSV (plain or gzipped).");
    return new Uint8Array(await readFile(path));
  }

  console.log(`[star-catalog] downloading ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`HYG download failed with status ${response.status}.`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const main = async (): Promise<void> => {
  const source = await readSource();
  const digest = createHash("sha256").update(source).digest("hex");
  const gzipped = source[0] === 0x1f && source[1] === 0x8b;

  if (digest !== SOURCE_SHA256) {
    // Deliberately fatal. A different upstream file is a different sky, and the provenance
    // recorded in THIRD_PARTY_ASSETS.md names this exact release.
    throw new Error(
      `HYG source digest ${digest} does not match the pinned ${SOURCE_SHA256}. ` +
        "If the upstream release really did change, update SOURCE_URL, SOURCE_SHA256 and " +
        "THIRD_PARTY_ASSETS.md together.",
    );
  }

  const csv = Buffer.from(gzipped ? gunzipSync(source) : source).toString("utf8");
  const { counts, stars } = selectStars(csv);
  const packed = packCatalogue(stars);
  await writeFile(OUTPUT_URL, packed);

  console.log(`[star-catalog] read     ${counts.rows.toLocaleString("en-US")} HYG rows`);
  console.log(
    `[star-catalog] kept     ${counts.selected.toLocaleString("en-US")} stars at V <= ${MAGNITUDE_LIMIT}`,
  );
  console.log(`[star-catalog]   of which ${counts.droppedNoParallax} have no usable parallax`);
  console.log(`[star-catalog] dropped  ${counts.droppedNoColourIndex} with no colour index`);
  console.log(
    `[star-catalog] wrote    ${packed.byteLength.toLocaleString("en-US")} bytes to ${OUTPUT_URL.pathname}`,
  );
};

await main();
