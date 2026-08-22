import { readFile } from "node:fs/promises";
import { afterEach, expect, test, vi } from "vite-plus/test";
import {
  colourIndexToTemperatureKelvin,
  loadSkyCatalog,
  parseSkyCatalog,
  projectSky,
  resetSkyCatalogForTesting,
  skyViewpointFrom,
  SkyCatalogFormatError,
  SKY_CATALOG_URL,
  type SkyCatalog,
} from "./sky-catalog.ts";

const BUNDLED_ASSET = new URL("../public/sky/hyg-v44-vmag65.bin", import.meta.url);

const readBundledAsset = async (): Promise<ArrayBuffer> => {
  const file = await readFile(BUNDLED_ASSET);
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer;
};

interface SyntheticStar {
  colourIndex: number;
  declinationDegrees: number;
  /** Parsecs, or 0 for a star with no usable parallax. */
  distanceParsecs: number;
  rightAscensionDegrees: number;
  visualMagnitude: number;
}

/** Writes the same layout `scripts/build-star-catalog.ts` produces, for a handful of stars. */
const packSynthetic = (stars: readonly SyntheticStar[], magnitudeLimit = 6.5): ArrayBuffer => {
  const count = stars.length;
  const buffer = new ArrayBuffer(16 + count * 16);
  const header = new DataView(buffer);
  header.setUint32(0, 0x4b_53_58_45, true);
  header.setUint16(4, 1, true);
  header.setUint16(6, 0, true);
  header.setUint32(8, count, true);
  header.setFloat32(12, magnitudeLimit, true);

  const rightAscension = new Float32Array(buffer, 16, count);
  const declination = new Float32Array(buffer, 16 + count * 4, count);
  const distance = new Float32Array(buffer, 16 + count * 8, count);
  const magnitude = new Int16Array(buffer, 16 + count * 12, count);
  const colourIndex = new Int16Array(buffer, 16 + count * 14, count);

  for (const [index, star] of stars.entries()) {
    rightAscension[index] = (star.rightAscensionDegrees * Math.PI) / 180;
    declination[index] = (star.declinationDegrees * Math.PI) / 180;
    distance[index] = star.distanceParsecs;
    magnitude[index] = Math.round(star.visualMagnitude * 1_000);
    colourIndex[index] = Math.round(star.colourIndex * 1_000);
  }

  return buffer;
};

const syntheticCatalog = (stars: readonly SyntheticStar[], magnitudeLimit = 6.5): SkyCatalog =>
  parseSkyCatalog(packSynthetic(stars, magnitudeLimit));

const sceneVector = (
  positions: Float32Array,
  index: number,
): { x: number; y: number; z: number } => ({
  x: positions[index * 3],
  y: positions[index * 3 + 1],
  z: positions[index * 3 + 2],
});

afterEach(() => {
  resetSkyCatalogForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the bundled asset parses and holds the naked-eye sky", async () => {
  const catalog = parseSkyCatalog(await readBundledAsset());

  expect(catalog.magnitudeLimit).toBe(6.5);
  // Hipparcos is complete well past this cut, so the count is a property of the sky rather than
  // of the build: roughly nine thousand stars are visible to the unaided eye from Earth.
  expect(catalog.count).toBeGreaterThan(8_000);
  expect(catalog.count).toBeLessThan(10_000);
  expect(catalog.unitDirections).toHaveLength(catalog.count * 3);

  // Written brightest first, and the brightest star in the sky is Sirius at V = -1.44.
  expect(catalog.visualMagnitude[0] / 1_000).toBeCloseTo(-1.44, 3);
  expect(catalog.distanceParsecs[0]).toBeCloseTo(2.637, 2);
  for (let index = 1; index < catalog.count; index += 1) {
    expect(catalog.visualMagnitude[index]).toBeGreaterThanOrEqual(
      catalog.visualMagnitude[index - 1],
    );
  }
});

test("every catalogued direction is a unit vector and nothing exceeds the faint cut", async () => {
  const catalog = parseSkyCatalog(await readBundledAsset());

  for (let index = 0; index < catalog.count; index += 1) {
    const x = catalog.unitDirections[index * 3];
    const y = catalog.unitDirections[index * 3 + 1];
    const z = catalog.unitDirections[index * 3 + 2];
    expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
    expect(catalog.visualMagnitude[index] / 1_000).toBeLessThanOrEqual(catalog.magnitudeLimit);
    // Zero is the marker for a star with no usable parallax. A negative or tiny distance would
    // mean the build invented one.
    expect(catalog.distanceParsecs[index] === 0 || catalog.distanceParsecs[index] > 1).toBe(true);
  }
});

test("a malformed asset is rejected rather than read as stars", () => {
  expect(() => parseSkyCatalog(new ArrayBuffer(4))).toThrow(SkyCatalogFormatError);

  const wrongMagic = packSynthetic([]);
  new DataView(wrongMagic).setUint32(0, 0xdead_beef, true);
  expect(() => parseSkyCatalog(wrongMagic)).toThrow(/magic number/);

  const wrongVersion = packSynthetic([]);
  new DataView(wrongVersion).setUint16(4, 99, true);
  expect(() => parseSkyCatalog(wrongVersion)).toThrow(/version 99/);

  const truncated = packSynthetic([
    {
      colourIndex: 0,
      declinationDegrees: 0,
      distanceParsecs: 10,
      rightAscensionDegrees: 0,
      visualMagnitude: 3,
    },
  ]).slice(0, 24);
  expect(() => parseSkyCatalog(truncated)).toThrow(/bytes/);
});

test("an unreachable catalogue resolves to null instead of failing the destination", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response("", { status: 404 }))),
  );

  await expect(loadSkyCatalog()).resolves.toBeNull();
});

test("the catalogue is downloaded once and shared by every destination", async () => {
  const asset = await readBundledAsset();
  const fetcher = vi.fn(() => Promise.resolve(new Response(asset)));
  vi.stubGlobal("fetch", fetcher);

  const [first, second] = await Promise.all([loadSkyCatalog(), loadSkyCatalog()]);

  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(SKY_CATALOG_URL);
  expect(first).toBe(second);
  expect(first?.count).toBeGreaterThan(8_000);
});

test("a viewpoint needs all three measurements, and refuses to be invented", () => {
  expect(
    skyViewpointFrom({
      declinationDegrees: 38.78,
      distanceParsecs: 7.68,
      rightAscensionDegrees: 279.23,
    }),
  ).toEqual({ declinationDegrees: 38.78, distanceParsecs: 7.68, rightAscensionDegrees: 279.23 });

  expect(
    skyViewpointFrom({
      declinationDegrees: 38.78,
      distanceParsecs: null,
      rightAscensionDegrees: 279.23,
    }),
  ).toBeNull();
  expect(
    skyViewpointFrom({ declinationDegrees: null, distanceParsecs: 7.68, rightAscensionDegrees: 1 }),
  ).toBeNull();
  expect(
    skyViewpointFrom({ declinationDegrees: 1, distanceParsecs: 7.68, rightAscensionDegrees: null }),
  ).toBeNull();
  // A distance of zero is the Sun's own position, not a place a catalogue object can be.
  expect(
    skyViewpointFrom({ declinationDegrees: 1, distanceParsecs: 0, rightAscensionDegrees: 1 }),
  ).toBeNull();
  expect(
    skyViewpointFrom({
      declinationDegrees: 1,
      distanceParsecs: Number.NaN,
      rightAscensionDegrees: 1,
    }),
  ).toBeNull();
});

test("colour comes from the catalogued colour index, through a black-body temperature", () => {
  // The Sun's B-V is 0.656 and its effective temperature is 5,772 K; Ballesteros' relation is
  // what turns one into the other, and it lands within a hundred kelvin of the real value.
  expect(colourIndexToTemperatureKelvin(0.656)).toBeGreaterThan(5_650);
  expect(colourIndexToTemperatureKelvin(0.656)).toBeLessThan(5_900);
  // Redder is cooler, and monotonically so across the whole catalogued range.
  expect(colourIndexToTemperatureKelvin(1.6)).toBeLessThan(colourIndexToTemperatureKelvin(0.656));
  expect(colourIndexToTemperatureKelvin(0.0)).toBeGreaterThan(
    colourIndexToTemperatureKelvin(0.656),
  );

  const catalog = syntheticCatalog([
    // A cool red giant and a hot blue star, in opposite directions so neither can be confused
    // with the other by position.
    {
      colourIndex: 1.85,
      declinationDegrees: 0,
      distanceParsecs: 50,
      rightAscensionDegrees: 0,
      visualMagnitude: 2,
    },
    {
      colourIndex: -0.2,
      declinationDegrees: 0,
      distanceParsecs: 50,
      rightAscensionDegrees: 180,
      visualMagnitude: 2,
    },
  ]);
  const { colors } = projectSky(
    catalog,
    { declinationDegrees: 90, distanceParsecs: 30, rightAscensionDegrees: 0 },
    { shellRadius: 90, starLimit: 10 },
  );

  expect(colors[0]).toBeGreaterThan(colors[2]);
  expect(colors[6]).toBeGreaterThan(colors[4]);
});

test("the north celestial pole is scene up, and the sky is not mirrored", () => {
  const catalog = syntheticCatalog([
    {
      colourIndex: 0.5,
      declinationDegrees: 0,
      distanceParsecs: 0,
      rightAscensionDegrees: 0,
      visualMagnitude: 1,
    },
    {
      colourIndex: 0.5,
      declinationDegrees: 0,
      distanceParsecs: 0,
      rightAscensionDegrees: 90,
      visualMagnitude: 1,
    },
    {
      colourIndex: 0.5,
      declinationDegrees: 90,
      distanceParsecs: 0,
      rightAscensionDegrees: 0,
      visualMagnitude: 1,
    },
  ]);
  // All three have no parallax, so they keep their catalogued directions whatever the viewpoint.
  const { positions } = projectSky(
    catalog,
    { declinationDegrees: 12, distanceParsecs: 400, rightAscensionDegrees: 200 },
    { shellRadius: 90, starLimit: 10 },
  );

  const equinox = sceneVector(positions, 0);
  const sixHours = sceneVector(positions, 1);
  const pole = sceneVector(positions, 2);

  expect(equinox.x).toBeCloseTo(90, 3);
  expect(equinox.y).toBeCloseTo(0, 3);
  expect(equinox.z).toBeCloseTo(0, 3);
  expect(sixHours.z).toBeCloseTo(90, 3);
  expect(pole.y).toBeCloseTo(90, 3);

  // The equatorial frame is right-handed and a Babylon scene is left-handed, so the mapping
  // between them has to reverse orientation — otherwise every constellation renders mirrored.
  // The determinant of the three mapped basis vectors is what says whether it does.
  const determinant =
    equinox.x * (sixHours.y * pole.z - sixHours.z * pole.y) -
    equinox.y * (sixHours.x * pole.z - sixHours.z * pole.x) +
    equinox.z * (sixHours.x * pole.y - sixHours.y * pole.x);
  expect(determinant).toBeLessThan(0);
});

test("distance is what moves a star, so the near ones swing and the far ones do not", () => {
  const near = {
    colourIndex: 0.5,
    declinationDegrees: 0,
    distanceParsecs: 10,
    rightAscensionDegrees: 0,
    visualMagnitude: 2,
  };
  const far = { ...near, distanceParsecs: 900 };
  const viewpoint = { declinationDegrees: 90, distanceParsecs: 10, rightAscensionDegrees: 0 };

  const { positions } = projectSky(syntheticCatalog([near, far]), viewpoint, {
    shellRadius: 1,
    starLimit: 10,
  });

  // The viewer stands 10 pc up the polar axis. The near star is 10 pc out along the equinox axis,
  // so from there it sits 45 degrees below the equator: an enormous shift for a star Earth sees
  // exactly on the equator.
  const nearDirection = sceneVector(positions, 0);
  expect(nearDirection.x).toBeCloseTo(Math.SQRT1_2, 4);
  expect(nearDirection.y).toBeCloseTo(-Math.SQRT1_2, 4);

  // The far one has barely stirred: 10 pc of baseline against 900 pc of distance.
  const farDirection = sceneVector(positions, 1);
  expect(farDirection.x).toBeGreaterThan(0.99);
  expect(Math.abs(farDirection.y)).toBeLessThan(0.02);
});

test("apparent magnitude is recomputed, and stars that fall below the cut are dropped", () => {
  const catalog = syntheticCatalog([
    // Earth sees this one at the very edge of naked-eye visibility from 10 pc. Move 90 pc further
    // away and it is five magnitudes fainter, which is well past the limit.
    {
      colourIndex: 0.5,
      declinationDegrees: 0,
      distanceParsecs: 10,
      rightAscensionDegrees: 0,
      visualMagnitude: 6.4,
    },
    // This one is faint from Earth at 100 pc and blazing from 10 pc away.
    {
      colourIndex: 0.5,
      declinationDegrees: 0,
      distanceParsecs: 100,
      rightAscensionDegrees: 180,
      visualMagnitude: 6.4,
    },
  ]);

  // Standing 100 pc along the equinox axis: 90 pc past the first star, 0 pc from... no — the
  // second star lies in the opposite direction, so the viewer ends up 200 pc from it.
  const receding = projectSky(
    catalog,
    { declinationDegrees: 0, distanceParsecs: 100, rightAscensionDegrees: 0 },
    { shellRadius: 90, starLimit: 10 },
  );
  expect(receding.drawn).toBe(0);

  // From 90 pc along the opposite direction the second star is only 10 pc away: five magnitudes
  // brighter than the 100 pc Earth sees it from, so 1.4 rather than 6.4.
  const approaching = projectSky(
    catalog,
    { declinationDegrees: 0, distanceParsecs: 90, rightAscensionDegrees: 180 },
    { shellRadius: 90, starLimit: 10 },
  );
  expect(approaching.drawn).toBe(1);
  // Brighter stars are drawn brighter, and 1.4 is bright enough to be well up the scale.
  expect(approaching.colors[0]).toBeGreaterThan(0.6);
});

test("a star with no usable parallax keeps its direction and its catalogued magnitude", () => {
  const unplaceable = {
    colourIndex: 0.5,
    declinationDegrees: 30,
    distanceParsecs: 0,
    rightAscensionDegrees: 45,
    visualMagnitude: 4,
  };
  const near = { ...unplaceable, distanceParsecs: 12 };

  const close = projectSky(
    syntheticCatalog([unplaceable, near]),
    { declinationDegrees: 0, distanceParsecs: 5, rightAscensionDegrees: 0 },
    { shellRadius: 1, starLimit: 10 },
  );
  const distant = projectSky(
    syntheticCatalog([unplaceable, near]),
    { declinationDegrees: 0, distanceParsecs: 400, rightAscensionDegrees: 0 },
    { shellRadius: 1, starLimit: 10 },
  );

  // Same direction and same brightness from both viewpoints, because moving it would need a
  // distance nobody has measured.
  expect(sceneVector(close.positions, 0)).toEqual(sceneVector(distant.positions, 0));
  expect(close.colors[0]).toBeCloseTo(distant.colors[0], 6);

  // Its neighbour, which does have a parallax, moved between the two.
  expect(sceneVector(close.positions, 1)).not.toEqual(sceneVector(distant.positions, 1));
});

test("the star the scene is already drawing is not drawn again as a background point", () => {
  const subject = {
    colourIndex: 0.0,
    declinationDegrees: 38.78,
    distanceParsecs: 7.679,
    rightAscensionDegrees: 279.23,
    visualMagnitude: 0.03,
  };
  const neighbour = { ...subject, distanceParsecs: 9.2, visualMagnitude: 3 };

  // Standing at the subject, reached through a different catalogue that puts it a few thousandths
  // of a parsec away. Without the cut it would be a second, magnitude -25 copy of the star the
  // scene renders in front of the visitor — and the direction to it would be a division by zero.
  const { drawn, positions } = projectSky(
    syntheticCatalog([subject, neighbour]),
    { declinationDegrees: 38.78, distanceParsecs: 7.682, rightAscensionDegrees: 279.23 },
    { shellRadius: 90, starLimit: 10 },
  );

  expect(drawn).toBe(1);
  expect(Number.isFinite(positions[0])).toBe(true);
});

test("the device budget keeps the brightest stars the viewpoint can actually see", () => {
  const at = (rightAscensionDegrees: number, visualMagnitude: number): SyntheticStar => ({
    colourIndex: 0.5,
    declinationDegrees: 0,
    distanceParsecs: 0,
    rightAscensionDegrees,
    visualMagnitude,
  });
  const catalog = syntheticCatalog([at(0, 1.2), at(40, 5.9), at(80, 3.4), at(120, 6.1)]);
  const viewpoint = { declinationDegrees: 20, distanceParsecs: 50, rightAscensionDegrees: 10 };

  const budgeted = projectSky(catalog, viewpoint, { shellRadius: 1, starLimit: 2 });
  expect(budgeted.drawn).toBe(2);
  expect(budgeted.positions).toHaveLength(6);
  expect(budgeted.colors).toHaveLength(8);
  // Magnitudes 1.2 and 3.4, at right ascensions 0 and 80 degrees.
  expect(sceneVector(budgeted.positions, 0).x).toBeCloseTo(1, 4);
  expect(sceneVector(budgeted.positions, 1).z).toBeCloseTo(Math.sin((80 * Math.PI) / 180), 4);
  // Brightest first, so the budgeted sky is the part of it a person would notice.
  expect(budgeted.colors[0]).toBeGreaterThan(budgeted.colors[4]);

  // A budget larger than the visible sky draws the visible sky, not the budget.
  expect(projectSky(catalog, viewpoint, { shellRadius: 1, starLimit: 500 }).drawn).toBe(4);
});

test("every drawn point sits on the shell the caller asked for", async () => {
  const catalog = parseSkyCatalog(await readBundledAsset());
  const { drawn, positions } = projectSky(
    catalog,
    { declinationDegrees: -60.83, distanceParsecs: 1.325, rightAscensionDegrees: 219.91 },
    { shellRadius: 90, starLimit: 2_400 },
  );

  expect(drawn).toBe(2_400);
  for (let index = 0; index < drawn; index += 1) {
    const { x, y, z } = sceneVector(positions, index);
    expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(90, 3);
  }
});

test("a parsec and a half from Earth already rearranges the sky", async () => {
  const catalog = parseSkyCatalog(await readBundledAsset());
  const options = { shellRadius: 1, starLimit: catalog.count };
  // As close to the Sun's own position as a catalogue object gets, so this is very nearly the
  // sky from Earth; and Alpha Centauri, 1.3 pc away, is the nearest place anyone could stand.
  const nearlyEarth = projectSky(
    catalog,
    { declinationDegrees: 0, distanceParsecs: 1e-6, rightAscensionDegrees: 0 },
    options,
  );
  const alphaCentauri = projectSky(
    catalog,
    { declinationDegrees: -60.834, distanceParsecs: 1.325, rightAscensionDegrees: 219.912 },
    options,
  );

  // Sirius is the first row of the catalogue and is 2.6 pc from the Sun, so a 1.3 pc baseline
  // swings it through tens of degrees — the parallax that makes going somewhere worth it.
  const fromEarth = sceneVector(nearlyEarth.positions, 0);
  const fromAlphaCentauri = sceneVector(alphaCentauri.positions, 0);
  const dot =
    fromEarth.x * fromAlphaCentauri.x +
    fromEarth.y * fromAlphaCentauri.y +
    fromEarth.z * fromAlphaCentauri.z;
  expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeGreaterThan(20);

  // Alpha Centauri itself is the place being stood on, so it leaves the background sky.
  expect(alphaCentauri.drawn).toBeLessThan(nearlyEarth.drawn);
});
