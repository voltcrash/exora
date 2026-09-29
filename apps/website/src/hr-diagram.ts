import type { StarProfile } from "@exora/contracts";
import { temperatureToRgb } from "@exora/worldgen";
import { colourIndexToTemperatureKelvin, type SkyCatalog } from "./sky-catalog.ts";

/*
 * WHERE A STAR SITS AMONG THE ONES WE CAN SEE
 *
 * The sky Exora already ships is every star brighter than magnitude 6.5 with a parallax, which is
 * enough for a Hertzsprung–Russell diagram of the naked-eye sky: temperature from each star's B−V
 * colour (Ballesteros 2012), absolute magnitude from its apparent magnitude and distance. A star
 * from SIMBAD is placed on the same axes from its own measured temperature, magnitude and
 * distance — never from its spectral type — and a star missing any of the three is not placed.
 */

export const HR_TEMPERATURE_DOMAIN = [2_400, 40_000] as const;
export const HR_MAGNITUDE_DOMAIN = [-9, 16] as const;
export const SUN = { absoluteMagnitude: 4.83, temperatureKelvin: 5_772 } as const;

const MILLI = 1_000;

export interface HrPoint {
  absoluteMagnitude: number;
  temperatureKelvin: number;
}

export interface HrPopulation {
  /** RGB per star in 0–1, matching the colour it is drawn at in the sky. */
  colors: Float32Array;
  count: number;
  /** Unit-square coordinates, x then y, with hot stars left and bright stars up. */
  positions: Float32Array;
}

export const absoluteMagnitude = (apparent: number, distanceParsecs: number): number =>
  apparent - 5 * Math.log10(distanceParsecs / 10);

/** Unit-square position on the diagram, or null outside its domain. */
export const hrPosition = ({
  absoluteMagnitude: magnitude,
  temperatureKelvin,
}: HrPoint): readonly [number, number] | null => {
  const [coolest, hottest] = HR_TEMPERATURE_DOMAIN;
  const [brightest, faintest] = HR_MAGNITUDE_DOMAIN;
  const x =
    (Math.log10(hottest) - Math.log10(temperatureKelvin)) /
    (Math.log10(hottest) - Math.log10(coolest));
  const y = (faintest - magnitude) / (faintest - brightest);
  return x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [x, y] : null;
};

export const hrPopulation = (catalog: SkyCatalog): HrPopulation => {
  const positions = new Float32Array(catalog.count * 2);
  const colors = new Float32Array(catalog.count * 3);
  let count = 0;
  for (let index = 0; index < catalog.count; index += 1) {
    const distance = catalog.distanceParsecs[index] ?? 0;
    if (!(distance > 0)) continue;
    const temperature = colourIndexToTemperatureKelvin((catalog.colourIndex[index] ?? 0) / MILLI);
    const position = hrPosition({
      absoluteMagnitude: absoluteMagnitude((catalog.visualMagnitude[index] ?? 0) / MILLI, distance),
      temperatureKelvin: temperature,
    });
    if (!position) continue;
    positions[count * 2] = position[0];
    positions[count * 2 + 1] = position[1];
    const [red, green, blue] = temperatureToRgb(temperature);
    colors[count * 3] = red;
    colors[count * 3 + 1] = green;
    colors[count * 3 + 2] = blue;
    count += 1;
  }
  return { colors, count, positions };
};

const measured = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : null;

/** The star's own place on the diagram from its record, or null when the record cannot fix it. */
export const hrSubject = (star: StarProfile): HrPoint | null => {
  if (star.source.archive === "Exora Custom Generator") return null;
  if (star.solarSystem) return SUN;
  const { distanceParsecs, effectiveTemperatureKelvin, visualMagnitude } = star.observation;
  const temperature = measured(effectiveTemperatureKelvin);
  const distance = measured(distanceParsecs);
  const magnitude = measured(visualMagnitude);
  if (temperature === null || distance === null || distance <= 0 || magnitude === null) {
    return null;
  }
  return {
    absoluteMagnitude: absoluteMagnitude(magnitude, distance),
    temperatureKelvin: temperature,
  };
};

// Approximate dwarf sequence after Pecaut & Mamajek (2013): temperature, absolute V magnitude.
const MAIN_SEQUENCE: readonly (readonly [number, number])[] = [
  [31_000, -3.5],
  [15_000, -1.2],
  [9_700, 0.6],
  [7_400, 2.5],
  [6_000, 4.4],
  [5_770, 4.8],
  [5_200, 5.9],
  [4_400, 7.3],
  [3_850, 8.9],
  [3_400, 11.1],
  [3_000, 13],
  [2_700, 15],
];

/** Absolute magnitude a dwarf of this temperature would have, interpolated in log T. */
export const mainSequenceMagnitude = (temperatureKelvin: number): number => {
  const clamped = Math.min(Math.max(temperatureKelvin, 2_700), 31_000);
  for (let index = 1; index < MAIN_SEQUENCE.length; index += 1) {
    const [hotT, hotM] = MAIN_SEQUENCE[index - 1]!;
    const [coolT, coolM] = MAIN_SEQUENCE[index]!;
    if (clamped <= hotT && clamped >= coolT) {
      const t = (Math.log10(hotT) - Math.log10(clamped)) / (Math.log10(hotT) - Math.log10(coolT));
      return hotM + t * (coolM - hotM);
    }
  }
  return MAIN_SEQUENCE.at(-1)![1];
};

/** A coarse plain-language region of the diagram, for the readout and the table twin. */
export const hrRegion = ({ absoluteMagnitude: magnitude, temperatureKelvin }: HrPoint): string => {
  const offset = mainSequenceMagnitude(temperatureKelvin) - magnitude;
  if (offset < -4) return "among the white dwarfs";
  if (offset > 2 && magnitude < -3.5) return "among the supergiants";
  if (offset > 2) return "among the giants";
  return "on the main sequence";
};
