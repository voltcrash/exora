import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { argv } from "node:process";
import { gunzipSync } from "node:zlib";

const SOURCE_URL =
  "https://codeberg.org/astronexus/hyg/media/branch/main/data/hyg/CURRENT/hyg_v44.csv.gz";
const SOURCE_SHA256 = "00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d";

const MAGNITUDE_LIMIT = 6.5;

const HYG_UNKNOWN_DISTANCE_PARSECS = 100_000;

const OUTPUT_URL = new URL("../public/sky/hyg-v44-vmag65.bin", import.meta.url);

const MAGIC = 0x4b_53_58_45;
const FORMAT_VERSION = 1;
const HEADER_BYTES = 16;

interface CatalogueStar {
  colourIndex: number;
  declinationRadians: number;
  distanceParsecs: number;
  rightAscensionRadians: number;
  visualMagnitude: number;
}

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

    if (fields[identifierColumn] === "0") continue;

    const visualMagnitude = numberOrNull(fields[magnitudeColumn]);
    if (visualMagnitude === null || visualMagnitude > MAGNITUDE_LIMIT) continue;

    const rightAscensionRadians = numberOrNull(fields[rightAscensionColumn]);
    const declinationRadians = numberOrNull(fields[declinationColumn]);
    if (rightAscensionRadians === null || declinationRadians === null) continue;

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

  stars.sort(
    (left, right) =>
      left.visualMagnitude - right.visualMagnitude ||
      left.rightAscensionRadians - right.rightAscensionRadians,
  );

  return { counts, stars };
};

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
