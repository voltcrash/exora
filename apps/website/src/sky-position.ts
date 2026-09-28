import { CONSTELLATION_BOUNDARIES } from "./constellation-boundaries.ts";

/*
 * WHERE TO LOOK
 *
 * A catalog position is two angles; what a reader can use is a constellation, a season and a
 * latitude. The constellation comes from the IAU boundaries (Delporte 1930, as tabulated by Roman
 * 1987), which are drawn in the coordinates of 1875 — so the J2000 position is first precessed back
 * with the IAU 1976 angles. The season is when the object stands opposite the Sun and so crosses
 * the meridian at local midnight. Visibility follows from declination alone: nothing else about
 * where the reader is decides whether a star ever clears their horizon.
 */

const DEGREES = Math.PI / 180;
const ARCSECONDS = DEGREES / 3_600;
const J2000_JD = 2_451_545;
const B1875_JD = 2_405_889.258_550_475;
const DAYS_PER_YEAR = 365.2422;
const MARCH_EQUINOX_DAY_OF_YEAR = 79;

export const CONSTELLATION_NAMES: Readonly<Record<string, string>> = {
  And: "Andromeda",
  Ant: "Antlia",
  Aps: "Apus",
  Aql: "Aquila",
  Aqr: "Aquarius",
  Ara: "Ara",
  Ari: "Aries",
  Aur: "Auriga",
  Boo: "Boötes",
  CMa: "Canis Major",
  CMi: "Canis Minor",
  CVn: "Canes Venatici",
  Cae: "Caelum",
  Cam: "Camelopardalis",
  Cap: "Capricornus",
  Car: "Carina",
  Cas: "Cassiopeia",
  Cen: "Centaurus",
  Cep: "Cepheus",
  Cet: "Cetus",
  Cha: "Chamaeleon",
  Cir: "Circinus",
  Cnc: "Cancer",
  Col: "Columba",
  Com: "Coma Berenices",
  CrA: "Corona Australis",
  CrB: "Corona Borealis",
  Crt: "Crater",
  Cru: "Crux",
  Crv: "Corvus",
  Cyg: "Cygnus",
  Del: "Delphinus",
  Dor: "Dorado",
  Dra: "Draco",
  Equ: "Equuleus",
  Eri: "Eridanus",
  For: "Fornax",
  Gem: "Gemini",
  Gru: "Grus",
  Her: "Hercules",
  Hor: "Horologium",
  Hya: "Hydra",
  Hyi: "Hydrus",
  Ind: "Indus",
  LMi: "Leo Minor",
  Lac: "Lacerta",
  Leo: "Leo",
  Lep: "Lepus",
  Lib: "Libra",
  Lup: "Lupus",
  Lyn: "Lynx",
  Lyr: "Lyra",
  Men: "Mensa",
  Mic: "Microscopium",
  Mon: "Monoceros",
  Mus: "Musca",
  Nor: "Norma",
  Oct: "Octans",
  Oph: "Ophiuchus",
  Ori: "Orion",
  Pav: "Pavo",
  Peg: "Pegasus",
  Per: "Perseus",
  Phe: "Phoenix",
  Pic: "Pictor",
  PsA: "Piscis Austrinus",
  Psc: "Pisces",
  Pup: "Puppis",
  Pyx: "Pyxis",
  Ret: "Reticulum",
  Scl: "Sculptor",
  Sco: "Scorpius",
  Sct: "Scutum",
  Ser: "Serpens",
  Sex: "Sextans",
  Sge: "Sagitta",
  Sgr: "Sagittarius",
  Tau: "Taurus",
  Tel: "Telescopium",
  TrA: "Triangulum Australe",
  Tri: "Triangulum",
  Tuc: "Tucana",
  UMa: "Ursa Major",
  UMi: "Ursa Minor",
  Vel: "Vela",
  Vir: "Virgo",
  Vol: "Volans",
  Vul: "Vulpecula",
};

/** Precesses a J2000 equatorial position to another epoch with the IAU 1976 angles. */
export const precessFromJ2000 = (
  rightAscensionDegrees: number,
  declinationDegrees: number,
  julianDate: number,
): { declinationDegrees: number; rightAscensionDegrees: number } => {
  const t = (julianDate - J2000_JD) / 36_525;
  const zeta = (2_306.2181 * t + 0.301_88 * t ** 2 + 0.017_998 * t ** 3) * ARCSECONDS;
  const z = (2_306.2181 * t + 1.094_68 * t ** 2 + 0.018_203 * t ** 3) * ARCSECONDS;
  const theta = (2_004.3109 * t - 0.426_65 * t ** 2 - 0.041_833 * t ** 3) * ARCSECONDS;
  const alpha = rightAscensionDegrees * DEGREES;
  const delta = declinationDegrees * DEGREES;
  const a = Math.cos(delta) * Math.sin(alpha + zeta);
  const b =
    Math.cos(theta) * Math.cos(delta) * Math.cos(alpha + zeta) - Math.sin(theta) * Math.sin(delta);
  const c =
    Math.sin(theta) * Math.cos(delta) * Math.cos(alpha + zeta) + Math.cos(theta) * Math.sin(delta);
  const precessedAlpha = Math.atan2(a, b) + z;
  return {
    declinationDegrees: Math.asin(Math.max(-1, Math.min(1, c))) / DEGREES,
    rightAscensionDegrees: (((precessedAlpha / DEGREES) % 360) + 360) % 360,
  };
};

/** The constellation containing a B1875 position, from Roman's ordered boundary table. */
export const constellationAtB1875 = (rightAscensionHours: number, declinationDegrees: number) => {
  for (const [lower, upper, south, abbreviation] of CONSTELLATION_BOUNDARIES) {
    if (declinationDegrees < south) continue;
    if (rightAscensionHours < lower || rightAscensionHours >= upper) continue;
    return abbreviation;
  }
  return "Oct";
};

export interface Constellation {
  abbreviation: string;
  name: string;
}

export const constellationOf = (
  rightAscensionDegrees: number,
  declinationDegrees: number,
): Constellation => {
  const b1875 = precessFromJ2000(rightAscensionDegrees, declinationDegrees, B1875_JD);
  const abbreviation = constellationAtB1875(
    b1875.rightAscensionDegrees / 15,
    b1875.declinationDegrees,
  );
  return { abbreviation, name: CONSTELLATION_NAMES[abbreviation] ?? abbreviation };
};

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** When the object crosses the meridian at local midnight, as "late September". */
export const midnightSeason = (rightAscensionDegrees: number): string => {
  // The Sun's right ascension is 0h at the March equinox and advances about 2h a month.
  const fraction = ((((rightAscensionDegrees + 180) % 360) + 360) % 360) / 360;
  const dayOfYear = (MARCH_EQUINOX_DAY_OF_YEAR + fraction * DAYS_PER_YEAR) % DAYS_PER_YEAR;
  const date = new Date(Date.UTC(2025, 0, 1) + dayOfYear * 86_400_000);
  const day = date.getUTCDate();
  const part = day <= 10 ? "early" : day <= 20 ? "mid" : "late";
  return `${part} ${MONTHS[date.getUTCMonth()]}`;
};

export interface LatitudeReach {
  /** Observers beyond this latitude never see it rise; null when it rises everywhere. */
  neverRisesBeyond: { hemisphere: "north" | "south"; latitude: number } | null;
  /** Observers beyond this latitude see it all night, every night; null at the equator. */
  circumpolarBeyond: { hemisphere: "north" | "south"; latitude: number } | null;
}

export const latitudeReach = (declinationDegrees: number): LatitudeReach => {
  const declination = Math.max(-90, Math.min(90, declinationDegrees));
  if (Math.abs(declination) < 0.5) return { circumpolarBeyond: null, neverRisesBeyond: null };
  const north = declination > 0;
  const latitude = Math.round((90 - Math.abs(declination)) * 10) / 10;
  return {
    circumpolarBeyond: {
      hemisphere: north ? "north" : "south",
      latitude,
    },
    neverRisesBeyond: {
      hemisphere: north ? "south" : "north",
      latitude,
    },
  };
};

export type ViewingAid = "binoculars" | "large telescope" | "naked eye" | "small telescope";

/** What it takes to see a point source of this apparent visual magnitude from a dark site. */
export const viewingAid = (visualMagnitude: number): ViewingAid =>
  visualMagnitude <= 6
    ? "naked eye"
    : visualMagnitude <= 9.5
      ? "binoculars"
      : visualMagnitude <= 13.5
        ? "small telescope"
        : "large telescope";

const KILOMETRES_PER_PARSEC = 3.085_677_581e13;
const LIGHT_YEARS_PER_PARSEC = 3.261_563_8;
const SECONDS_PER_YEAR = 31_557_600;
// Voyager 1's heliocentric cruise speed, the fastest outbound craft now leaving the Solar System.
const VOYAGER_KM_PER_SECOND = 16.9;
const STARSHOT_FRACTION_OF_LIGHT = 0.2;

export interface SkyFact {
  detail: string;
  label: string;
  value: string;
}

const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
const oneDecimal = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

const hemisphereLabel = ({ hemisphere, latitude }: { hemisphere: string; latitude: number }) =>
  `${oneDecimal.format(latitude)}° ${hemisphere === "north" ? "N" : "S"}`;

const years = (value: number): string =>
  value >= 1e6
    ? `${threeFigures.format(value / 1e6)} million years`
    : value >= 1e3
      ? `${threeFigures.format(value / 1e3)} thousand years`
      : `${threeFigures.format(value)} years`;

/** Where in Earth's sky to find a catalogued position, and how far away it is to travel. */
export const skyFacts = ({
  declinationDegrees,
  distanceParsecs,
  rightAscensionDegrees,
  visualMagnitude,
}: {
  declinationDegrees: number | null;
  distanceParsecs: number | null;
  rightAscensionDegrees: number | null;
  visualMagnitude: number | null;
}): SkyFact[] => {
  if (
    rightAscensionDegrees === null ||
    declinationDegrees === null ||
    !Number.isFinite(rightAscensionDegrees) ||
    !Number.isFinite(declinationDegrees)
  ) {
    return [];
  }
  const constellation = constellationOf(rightAscensionDegrees, declinationDegrees);
  const reach = latitudeReach(declinationDegrees);
  const facts: SkyFact[] = [
    {
      detail: `IAU boundaries · RA ${threeFigures.format(rightAscensionDegrees)}°, Dec ${oneDecimal.format(declinationDegrees)}° (J2000)`,
      label: "Constellation",
      value: constellation.name,
    },
    {
      detail: "Opposite the Sun, it crosses the meridian at local midnight",
      label: "Best seen",
      value: midnightSeason(rightAscensionDegrees),
    },
    reach.neverRisesBeyond && reach.circumpolarBeyond
      ? {
          detail: `Never rises beyond ${hemisphereLabel(reach.neverRisesBeyond)} · never sets beyond ${hemisphereLabel(reach.circumpolarBeyond)}`,
          label: "Who can see it",
          value: `${reach.neverRisesBeyond.hemisphere === "north" ? "South" : "North"} of ${hemisphereLabel(reach.neverRisesBeyond)}`,
        }
      : {
          detail: "On the celestial equator, it rises and sets for every observer on Earth",
          label: "Who can see it",
          value: "Everyone",
        },
  ];
  if (visualMagnitude !== null && Number.isFinite(visualMagnitude)) {
    const aid = viewingAid(visualMagnitude);
    facts.push({
      detail: `Visual magnitude ${oneDecimal.format(visualMagnitude)} · the unaided eye reaches about 6 under a dark sky`,
      label: "To see it",
      value: aid === "naked eye" ? "Naked eye" : `A ${aid}`.replace("A binoculars", "Binoculars"),
    });
  }
  if (distanceParsecs !== null && Number.isFinite(distanceParsecs) && distanceParsecs > 0) {
    const kilometres = distanceParsecs * KILOMETRES_PER_PARSEC;
    const lightYears = distanceParsecs * LIGHT_YEARS_PER_PARSEC;
    facts.push({
      detail: `At a fifth of light speed, Breakthrough Starshot's goal: ${years(lightYears / STARSHOT_FRACTION_OF_LIGHT)} · light takes ${years(lightYears)}`,
      label: "Voyager 1 would take",
      value: years(kilometres / VOYAGER_KM_PER_SECOND / SECONDS_PER_YEAR),
    });
  }
  return facts;
};
