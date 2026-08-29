import type { BlackHoleProfile } from "@exora/contracts";

export interface NormalizedBlackCatFixture {
  companion: string | null;
  declinationDegrees: number;
  distanceKpc: number | null;
  distanceUncertaintyKpc: number | null;
  dynamical: boolean;
  massSolar: number | null;
  massUncertaintySolar: number | null;
  name: string;
  rightAscensionDegrees: number;
}

export const NORMALIZED_BLACKCAT_FALLBACK: readonly NormalizedBlackCatFixture[] = [
  {
    name: "XTE J1650-500",
    companion: null,
    rightAscensionDegrees: 252.5041,
    declinationDegrees: -49.9621,
    distanceKpc: 2.6,
    distanceUncertaintyKpc: 0.7,
    dynamical: true,
    massSolar: 7.3,
    massUncertaintySolar: null,
  },
  {
    name: "XTE J1118+480",
    companion: "KV UMa",
    rightAscensionDegrees: 169.545,
    declinationDegrees: 48.0368,
    distanceKpc: 1.7,
    distanceUncertaintyKpc: 0.1,
    dynamical: true,
    massSolar: 6.9,
    massUncertaintySolar: null,
  },
  {
    name: "SAX J1819.3-2525",
    companion: "V4641 Sgr",
    rightAscensionDegrees: 274.8399,
    declinationDegrees: -25.407,
    distanceKpc: 6.2,
    distanceUncertaintyKpc: 0.7,
    dynamical: true,
    massSolar: 6.4,
    massUncertaintySolar: 0.6,
  },
  {
    name: "GRS 1915+105",
    companion: "V1487 Aql",
    rightAscensionDegrees: 288.7981,
    declinationDegrees: 10.9458,
    distanceKpc: 9,
    distanceUncertaintyKpc: 2,
    dynamical: true,
    massSolar: 10.1,
    massUncertaintySolar: 0.6,
  },
  {
    name: "GS 2023+338",
    companion: "V404 Cyg",
    rightAscensionDegrees: 306.0159,
    declinationDegrees: 33.8672,
    distanceKpc: 2.39,
    distanceUncertaintyKpc: 0.14,
    dynamical: true,
    massSolar: 9,
    massUncertaintySolar: 0.6,
  },
  {
    name: "3A 0620-003",
    companion: "V616 Mon",
    rightAscensionDegrees: 95.6854,
    declinationDegrees: -0.3458,
    distanceKpc: 1.06,
    distanceUncertaintyKpc: 0.1,
    dynamical: true,
    massSolar: 6.6,
    massUncertaintySolar: 0.3,
  },
  {
    name: "SWIFT J174540.2-290005",
    companion: null,
    rightAscensionDegrees: 266.4171,
    declinationDegrees: -29.0018,
    distanceKpc: null,
    distanceUncertaintyKpc: null,
    dynamical: false,
    massSolar: null,
    massUncertaintySolar: null,
  },
  {
    name: "SWIFT J1910.2-0546",
    companion: "MAXI J1910-057",
    rightAscensionDegrees: 287.595,
    declinationDegrees: -5.7989,
    distanceKpc: null,
    distanceUncertaintyKpc: null,
    dynamical: false,
    massSolar: null,
    massUncertaintySolar: null,
  },
  {
    name: "XTE J1752-223",
    companion: null,
    rightAscensionDegrees: 268.0629,
    declinationDegrees: -22.3423,
    distanceKpc: 6,
    distanceUncertaintyKpc: 2,
    dynamical: false,
    massSolar: null,
    massUncertaintySolar: null,
  },
  {
    name: "H 1743-322",
    companion: "XTE J1746-322",
    rightAscensionDegrees: 266.565,
    declinationDegrees: -32.2336,
    distanceKpc: 10,
    distanceUncertaintyKpc: null,
    dynamical: false,
    massSolar: null,
    massUncertaintySolar: null,
  },
  {
    name: "MAXI J1659-152",
    companion: null,
    rightAscensionDegrees: 254.757,
    declinationDegrees: -15.258,
    distanceKpc: 8.6,
    distanceUncertaintyKpc: 3.7,
    dynamical: false,
    massSolar: null,
    massUncertaintySolar: null,
  },
  {
    name: "GRS 1716-249",
    companion: "V2293 Oph",
    rightAscensionDegrees: 259.9039,
    declinationDegrees: -25.0176,
    distanceKpc: 2.4,
    distanceUncertaintyKpc: 0.4,
    dynamical: false,
    massSolar: null,
    massUncertaintySolar: null,
  },
];

export const normalizedFixtureProfiles = (
  normalize: (row: NormalizedBlackCatFixture, retrievedOn: string) => BlackHoleProfile,
): readonly BlackHoleProfile[] =>
  NORMALIZED_BLACKCAT_FALLBACK.map((row) => normalize(row, "2026-08-29"));
