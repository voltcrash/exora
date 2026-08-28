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
  distanceParsecs: number;
  rightAscensionDegrees: number;
  visualMagnitude: number;
}

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

const valueAt = (values: ArrayLike<number>, index: number): number => {
  const value = values[index];
  if (value === undefined) throw new Error(`Expected a value at index ${index}.`);
  return value;
};

const sceneVector = (
  positions: Float32Array,
  index: number,
): { x: number; y: number; z: number } => ({
  x: valueAt(positions, index * 3),
  y: valueAt(positions, index * 3 + 1),
  z: valueAt(positions, index * 3 + 2),
});

afterEach(() => {
  resetSkyCatalogForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

test("the bundled asset parses and holds the naked-eye sky", async () => {
  const catalog = parseSkyCatalog(await readBundledAsset());

  expect(catalog.magnitudeLimit).toBe(6.5);
  expect(catalog.count).toBeGreaterThan(8_000);
  expect(catalog.count).toBeLessThan(10_000);
  expect(catalog.unitDirections).toHaveLength(catalog.count * 3);

  expect(valueAt(catalog.visualMagnitude, 0) / 1_000).toBeCloseTo(-1.44, 3);
  expect(valueAt(catalog.distanceParsecs, 0)).toBeCloseTo(2.637, 2);
  for (let index = 1; index < catalog.count; index += 1) {
    expect(valueAt(catalog.visualMagnitude, index)).toBeGreaterThanOrEqual(
      valueAt(catalog.visualMagnitude, index - 1),
    );
  }
});

test("every catalogued direction is a unit vector and nothing exceeds the faint cut", async () => {
  const catalog = parseSkyCatalog(await readBundledAsset());

  for (let index = 0; index < catalog.count; index += 1) {
    const x = valueAt(catalog.unitDirections, index * 3);
    const y = valueAt(catalog.unitDirections, index * 3 + 1);
    const z = valueAt(catalog.unitDirections, index * 3 + 2);
    expect(Math.sqrt(x * x + y * y + z * z)).toBeCloseTo(1, 5);
    expect(valueAt(catalog.visualMagnitude, index) / 1_000).toBeLessThanOrEqual(
      catalog.magnitudeLimit,
    );
    const distance = valueAt(catalog.distanceParsecs, index);
    expect(distance === 0 || distance > 1).toBe(true);
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
  expect(colourIndexToTemperatureKelvin(0.656)).toBeGreaterThan(5_650);
  expect(colourIndexToTemperatureKelvin(0.656)).toBeLessThan(5_900);
  expect(colourIndexToTemperatureKelvin(1.6)).toBeLessThan(colourIndexToTemperatureKelvin(0.656));
  expect(colourIndexToTemperatureKelvin(0.0)).toBeGreaterThan(
    colourIndexToTemperatureKelvin(0.656),
  );

  const catalog = syntheticCatalog([
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

  expect(valueAt(colors, 0)).toBeGreaterThan(valueAt(colors, 2));
  expect(valueAt(colors, 6)).toBeGreaterThan(valueAt(colors, 4));
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

  const nearDirection = sceneVector(positions, 0);
  expect(nearDirection.x).toBeCloseTo(Math.SQRT1_2, 4);
  expect(nearDirection.y).toBeCloseTo(-Math.SQRT1_2, 4);

  const farDirection = sceneVector(positions, 1);
  expect(farDirection.x).toBeGreaterThan(0.99);
  expect(Math.abs(farDirection.y)).toBeLessThan(0.02);
});

test("apparent magnitude is recomputed, and stars that fall below the cut are dropped", () => {
  const catalog = syntheticCatalog([
    {
      colourIndex: 0.5,
      declinationDegrees: 0,
      distanceParsecs: 10,
      rightAscensionDegrees: 0,
      visualMagnitude: 6.4,
    },
    {
      colourIndex: 0.5,
      declinationDegrees: 0,
      distanceParsecs: 100,
      rightAscensionDegrees: 180,
      visualMagnitude: 6.4,
    },
  ]);

  const receding = projectSky(
    catalog,
    { declinationDegrees: 0, distanceParsecs: 100, rightAscensionDegrees: 0 },
    { shellRadius: 90, starLimit: 10 },
  );
  expect(receding.drawn).toBe(0);

  const approaching = projectSky(
    catalog,
    { declinationDegrees: 0, distanceParsecs: 90, rightAscensionDegrees: 180 },
    { shellRadius: 90, starLimit: 10 },
  );
  expect(approaching.drawn).toBe(1);
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

  expect(close.drawn).toBe(2);
  expect(distant.drawn).toBe(1);
  expect(sceneVector(close.positions, 0)).toEqual(sceneVector(distant.positions, 0));
  expect(valueAt(close.colors, 0)).toBeCloseTo(valueAt(distant.colors, 0), 6);

  expect(sceneVector(close.positions, 1)).not.toEqual(sceneVector(close.positions, 0));
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
  expect(sceneVector(budgeted.positions, 0).x).toBeCloseTo(1, 4);
  expect(sceneVector(budgeted.positions, 1).z).toBeCloseTo(Math.sin((80 * Math.PI) / 180), 4);
  expect(valueAt(budgeted.colors, 0)).toBeGreaterThan(valueAt(budgeted.colors, 4));

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

  const fromEarth = sceneVector(nearlyEarth.positions, 0);
  const fromAlphaCentauri = sceneVector(alphaCentauri.positions, 0);
  const dot =
    fromEarth.x * fromAlphaCentauri.x +
    fromEarth.y * fromAlphaCentauri.y +
    fromEarth.z * fromAlphaCentauri.z;
  expect((Math.acos(Math.min(1, dot)) * 180) / Math.PI).toBeGreaterThan(20);

  expect(alphaCentauri.drawn).toBeLessThan(nearlyEarth.drawn);
});
