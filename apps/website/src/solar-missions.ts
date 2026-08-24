export interface MissionSource {
  datasetId: string;
  retrievedOn: string;
  source: string;
  url: string;
}

export interface MissionMilestone {
  date: string;
  label: string;
}

export interface SurfaceMissionSite extends MissionMilestone {
  latitudeDegrees: number;
  longitudeDegreesEast: number;
  missionId?: string;
}

interface MissionBase {
  agency: string;
  aliases: readonly string[];
  endDate: string | null;
  id: string;
  name: string;
  parent: "Mars" | "Moon" | "Sun";
  sources: readonly MissionSource[];
  startDate: string;
  summary: string;
}

export interface SpacecraftMissionProfile extends MissionBase {
  kind: "trajectory";
  milestones: readonly MissionMilestone[];
  spkId: string;
  trajectory: { start: string; stepDays: number; stop: string };
}

export interface SurfaceMissionProfile extends MissionBase {
  anchorNaifId: 301 | 499;
  anchorSpkId: "301" | "499";
  kind: "surface-sites";
  sites: readonly SurfaceMissionSite[];
}

export type SolarMissionProfile = SpacecraftMissionProfile | SurfaceMissionProfile;

const horizonsSource: MissionSource = {
  datasetId: "Horizons API 1.2 · SPICE/navigation trajectory",
  retrievedOn: "2026-08-24",
  source: "NASA/JPL Solar System Dynamics",
  url: "https://ssd.jpl.nasa.gov/horizons/",
};

const nasaMission = (datasetId: string, url: string): MissionSource => ({
  datasetId,
  retrievedOn: "2026-08-24",
  source: "NASA Science mission record",
  url,
});

const spacecraft = (
  mission: Omit<SpacecraftMissionProfile, "kind" | "parent" | "sources"> & {
    missionSource: MissionSource;
  },
): SpacecraftMissionProfile => {
  const { missionSource, ...profile } = mission;
  return {
    ...profile,
    kind: "trajectory",
    parent: "Sun",
    sources: [horizonsSource, missionSource],
  };
};

export const SOLAR_SYSTEM_MISSIONS: readonly SolarMissionProfile[] = [
  spacecraft({
    agency: "NASA",
    aliases: ["Voyager 1", "Voyager-1", "NAIF -31"],
    endDate: null,
    id: "voyager-1",
    milestones: [
      { date: "1977-09-05", label: "Launch" },
      { date: "1979-03-05", label: "Jupiter encounter" },
      { date: "1980-11-12", label: "Saturn encounter" },
      { date: "2012-08-25", label: "Heliopause crossing" },
    ],
    missionSource: nasaMission(
      "Voyager mission chronology",
      "https://science.nasa.gov/mission/voyager/",
    ),
    name: "Voyager 1",
    spkId: "-31",
    startDate: "1977-09-05",
    summary:
      "The first spacecraft to enter interstellar space, after flybys of Jupiter and Saturn.",
    trajectory: { start: "1977-09-06", stepDays: 60, stop: "2035-01-01" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["Voyager 2", "Voyager-2", "NAIF -32"],
    endDate: null,
    id: "voyager-2",
    milestones: [
      { date: "1977-08-20", label: "Launch" },
      { date: "1979-07-09", label: "Jupiter encounter" },
      { date: "1981-08-25", label: "Saturn encounter" },
      { date: "1986-01-24", label: "Uranus encounter" },
      { date: "1989-08-25", label: "Neptune encounter" },
      { date: "2018-11-05", label: "Heliopause crossing" },
    ],
    missionSource: nasaMission(
      "Voyager mission chronology",
      "https://science.nasa.gov/mission/voyager/",
    ),
    name: "Voyager 2",
    spkId: "-32",
    startDate: "1977-08-20",
    summary:
      "The only spacecraft to visit Uranus and Neptune, now operating beyond the heliopause.",
    trajectory: { start: "1977-08-21", stepDays: 60, stop: "2035-01-01" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["Pioneer 10", "Pioneer F", "NAIF -23"],
    endDate: "2003-01-23",
    id: "pioneer-10",
    milestones: [
      { date: "1972-03-03", label: "Launch" },
      { date: "1973-12-04", label: "Jupiter encounter" },
      { date: "2003-01-23", label: "Last telemetry" },
    ],
    missionSource: nasaMission(
      "Pioneer 10 mission record",
      "https://science.nasa.gov/mission/pioneer-10/",
    ),
    name: "Pioneer 10",
    spkId: "-23",
    startDate: "1972-03-03",
    summary:
      "The first spacecraft through the asteroid belt and the first close reconnaissance of Jupiter.",
    trajectory: { start: "1972-03-04", stepDays: 45, stop: "2003-01-23" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["Pioneer 11", "Pioneer G", "NAIF -24"],
    endDate: "1995-11-24",
    id: "pioneer-11",
    milestones: [
      { date: "1973-04-06", label: "Launch" },
      { date: "1974-12-03", label: "Jupiter encounter" },
      { date: "1979-09-01", label: "Saturn encounter" },
      { date: "1995-11-24", label: "Last contact" },
    ],
    missionSource: nasaMission(
      "Pioneer 11 mission record",
      "https://science.nasa.gov/mission/pioneer-11/",
    ),
    name: "Pioneer 11",
    spkId: "-24",
    startDate: "1973-04-06",
    summary: "The first spacecraft to encounter Saturn, following a gravity assist at Jupiter.",
    trajectory: { start: "1973-04-07", stepDays: 30, stop: "1995-11-24" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["New Horizons", "NewHorizons", "NAIF -98"],
    endDate: null,
    id: "new-horizons",
    milestones: [
      { date: "2006-01-19", label: "Launch" },
      { date: "2007-02-28", label: "Jupiter gravity assist" },
      { date: "2015-07-14", label: "Pluto flyby" },
      { date: "2019-01-01", label: "Arrokoth flyby" },
    ],
    missionSource: nasaMission(
      "New Horizons mission chronology",
      "https://science.nasa.gov/mission/new-horizons/",
    ),
    name: "New Horizons",
    spkId: "-98",
    startDate: "2006-01-19",
    summary: "The first reconnaissance of Pluto and the Kuiper Belt object Arrokoth.",
    trajectory: { start: "2006-01-20", stepDays: 30, stop: "2035-01-01" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["Parker Solar Probe", "PSP", "NAIF -96"],
    endDate: null,
    id: "parker-solar-probe",
    milestones: [
      { date: "2018-08-12", label: "Launch" },
      { date: "2018-11-06", label: "First perihelion" },
      { date: "2024-12-24", label: "Record solar approach" },
    ],
    missionSource: nasaMission(
      "Parker Solar Probe mission chronology",
      "https://science.nasa.gov/mission/parker-solar-probe/",
    ),
    name: "Parker Solar Probe",
    spkId: "-96",
    startDate: "2018-08-12",
    summary: "A solar probe repeatedly sampling the Sun’s outer corona on gravity-assisted orbits.",
    trajectory: { start: "2018-08-13", stepDays: 12, stop: "2029-12-31" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["Juno", "NAIF -61"],
    endDate: null,
    id: "juno",
    milestones: [
      { date: "2011-08-05", label: "Launch" },
      { date: "2016-07-05", label: "Jupiter orbit insertion" },
      { date: "2021-06-07", label: "Ganymede flyby" },
      { date: "2022-09-29", label: "Europa flyby" },
    ],
    missionSource: nasaMission("Juno mission chronology", "https://science.nasa.gov/mission/juno/"),
    name: "Juno",
    spkId: "-61",
    startDate: "2011-08-05",
    summary: "A polar orbiter measuring Jupiter’s interior, atmosphere, magnetic field, and moons.",
    trajectory: { start: "2011-08-06", stepDays: 18, stop: "2028-09-30" },
  }),
  spacecraft({
    agency: "NASA / ESA / ASI",
    aliases: ["Cassini", "Cassini-Huygens", "NAIF -82"],
    endDate: "2017-09-15",
    id: "cassini",
    milestones: [
      { date: "1997-10-15", label: "Launch" },
      { date: "2004-07-01", label: "Saturn orbit insertion" },
      { date: "2005-01-14", label: "Huygens Titan landing" },
      { date: "2017-09-15", label: "Grand Finale entry" },
    ],
    missionSource: nasaMission(
      "Cassini mission chronology",
      "https://science.nasa.gov/mission/cassini/",
    ),
    name: "Cassini",
    spkId: "-82",
    startDate: "1997-10-15",
    summary: "A thirteen-year Saturn survey with the Huygens probe’s landing on Titan.",
    trajectory: { start: "1997-10-16", stepDays: 20, stop: "2017-09-15" },
  }),
  spacecraft({
    agency: "NASA / ESA",
    aliases: ["Galileo", "Galileo Orbiter", "NAIF -77"],
    endDate: "2003-09-21",
    id: "galileo",
    milestones: [
      { date: "1989-10-18", label: "Launch" },
      { date: "1991-10-29", label: "Gaspra flyby" },
      { date: "1993-08-28", label: "Ida flyby" },
      { date: "1995-12-07", label: "Jupiter orbit insertion" },
      { date: "2003-09-21", label: "Jupiter entry" },
    ],
    missionSource: nasaMission(
      "Galileo mission chronology",
      "https://science.nasa.gov/mission/galileo/",
    ),
    name: "Galileo",
    spkId: "-77",
    startDate: "1989-10-18",
    summary: "The first spacecraft to orbit Jupiter, after the first asteroid flybys.",
    trajectory: { start: "1989-10-20", stepDays: 18, stop: "2003-09-21" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["Dawn", "NAIF -203"],
    endDate: "2018-11-01",
    id: "dawn",
    milestones: [
      { date: "2007-09-27", label: "Launch" },
      { date: "2011-07-16", label: "Vesta orbit" },
      { date: "2012-09-05", label: "Departed Vesta" },
      { date: "2015-03-06", label: "Ceres orbit" },
      { date: "2018-11-01", label: "Mission end" },
    ],
    missionSource: nasaMission("Dawn mission chronology", "https://science.nasa.gov/mission/dawn/"),
    name: "Dawn",
    spkId: "-203",
    startDate: "2007-09-27",
    summary: "The first spacecraft to orbit two extraterrestrial destinations: Vesta and Ceres.",
    trajectory: { start: "2007-09-28", stepDays: 12, stop: "2018-11-01" },
  }),
  spacecraft({
    agency: "ESA",
    aliases: ["Rosetta", "NAIF -226"],
    endDate: "2016-09-30",
    id: "rosetta",
    milestones: [
      { date: "2004-03-02", label: "Launch" },
      { date: "2014-08-06", label: "67P rendezvous" },
      { date: "2014-11-12", label: "Philae landing" },
      { date: "2016-09-30", label: "Controlled comet impact" },
    ],
    missionSource: {
      datasetId: "Rosetta mission chronology",
      retrievedOn: "2026-08-24",
      source: "European Space Agency",
      url: "https://www.esa.int/Science_Exploration/Space_Science/Rosetta",
    },
    name: "Rosetta",
    spkId: "-226",
    startDate: "2004-03-02",
    summary: "The first spacecraft to orbit a comet, carrying the Philae lander to 67P.",
    trajectory: { start: "2004-03-03", stepDays: 12, stop: "2016-09-30" },
  }),
  spacecraft({
    agency: "NASA",
    aliases: ["OSIRIS-REx", "OSIRIS REx", "NAIF -64"],
    endDate: "2023-09-24",
    id: "osiris-rex",
    milestones: [
      { date: "2016-09-08", label: "Launch" },
      { date: "2018-12-03", label: "Bennu arrival" },
      { date: "2020-10-20", label: "Sample acquisition" },
      { date: "2023-09-24", label: "Sample return" },
    ],
    missionSource: nasaMission(
      "OSIRIS-REx mission chronology",
      "https://science.nasa.gov/mission/osiris-rex/",
    ),
    name: "OSIRIS-REx",
    spkId: "-64",
    startDate: "2016-09-08",
    summary: "NASA’s first asteroid sample-return mission, returning material from Bennu.",
    trajectory: { start: "2016-09-09", stepDays: 8, stop: "2023-09-24" },
  }),
  {
    agency: "NASA",
    aliases: ["Apollo", "Apollo landing sites", "Moon landings"],
    anchorNaifId: 301,
    anchorSpkId: "301",
    endDate: "1972-12-14",
    id: "apollo-landing-sites",
    kind: "surface-sites",
    name: "Apollo landing sites",
    parent: "Moon",
    sites: [
      {
        date: "1969-07-20",
        label: "Apollo 11 · Tranquility Base",
        latitudeDegrees: 0.67408,
        longitudeDegreesEast: 23.47297,
        missionId: "AS11",
      },
      {
        date: "1969-11-19",
        label: "Apollo 12 · Surveyor crater",
        latitudeDegrees: -3.01239,
        longitudeDegreesEast: -23.42157,
        missionId: "AS12",
      },
      {
        date: "1971-02-05",
        label: "Apollo 14 · Fra Mauro",
        latitudeDegrees: -3.6453,
        longitudeDegreesEast: -17.47136,
        missionId: "AS14",
      },
      {
        date: "1971-07-30",
        label: "Apollo 15 · Hadley–Apennine",
        latitudeDegrees: 26.13222,
        longitudeDegreesEast: 3.63386,
        missionId: "AS15",
      },
      {
        date: "1972-04-21",
        label: "Apollo 16 · Descartes",
        latitudeDegrees: -8.97301,
        longitudeDegreesEast: 15.50019,
        missionId: "AS16",
      },
      {
        date: "1972-12-11",
        label: "Apollo 17 · Taurus–Littrow",
        latitudeDegrees: 20.1908,
        longitudeDegreesEast: 30.77168,
        missionId: "AS17",
      },
    ],
    sources: [
      {
        datasetId: "LROC Apollo landing-site coordinates",
        retrievedOn: "2026-08-24",
        source: "NASA / Arizona State University LROC",
        url: "https://www.lroc.asu.edu/featured_sites",
      },
    ],
    startDate: "1969-07-20",
    summary: "The six measured lunar sites where Apollo crews landed and worked on the Moon.",
  },
  {
    agency: "NASA",
    aliases: ["Mars landers", "Mars rovers", "Mars landing sites"],
    anchorNaifId: 499,
    anchorSpkId: "499",
    endDate: null,
    id: "mars-landers-and-rovers",
    kind: "surface-sites",
    name: "Mars landers and rovers",
    parent: "Mars",
    sites: [
      {
        date: "1976-07-20",
        label: "Viking 1 · Chryse Planitia",
        latitudeDegrees: 22.697,
        longitudeDegreesEast: -48.222,
      },
      {
        date: "1976-09-03",
        label: "Viking 2 · Utopia Planitia",
        latitudeDegrees: 47.968,
        longitudeDegreesEast: 134.251,
      },
      {
        date: "1997-07-04",
        label: "Pathfinder / Sojourner",
        latitudeDegrees: 19.13,
        longitudeDegreesEast: -33.22,
        missionId: "NAIF -53",
      },
      {
        date: "2004-01-04",
        label: "Spirit · Gusev crater",
        latitudeDegrees: -14.5684,
        longitudeDegreesEast: 175.4726,
        missionId: "NAIF -254",
      },
      {
        date: "2004-01-25",
        label: "Opportunity · Meridiani Planum",
        latitudeDegrees: -1.9462,
        longitudeDegreesEast: -5.5266,
        missionId: "NAIF -253",
      },
      {
        date: "2008-05-25",
        label: "Phoenix · Vastitas Borealis",
        latitudeDegrees: 68.22,
        longitudeDegreesEast: -125.75,
        missionId: "NAIF -84",
      },
      {
        date: "2012-08-06",
        label: "Curiosity · Gale crater",
        latitudeDegrees: -4.5895,
        longitudeDegreesEast: 137.4417,
        missionId: "NAIF -76",
      },
      {
        date: "2018-11-26",
        label: "InSight · Elysium Planitia",
        latitudeDegrees: 4.5024,
        longitudeDegreesEast: 135.6234,
        missionId: "NAIF -189",
      },
      {
        date: "2021-02-18",
        label: "Perseverance · Jezero crater",
        latitudeDegrees: 18.4447,
        longitudeDegreesEast: 77.4508,
        missionId: "NAIF -168",
      },
    ],
    sources: [
      {
        datasetId: "Mars Exploration Program landing-site records",
        retrievedOn: "2026-08-24",
        source: "NASA Mars Exploration Program",
        url: "https://science.nasa.gov/mars/exploration/",
      },
      {
        datasetId: "NAIF ID required reading · spacecraft codes",
        retrievedOn: "2026-08-24",
        source: "NASA/JPL Navigation and Ancillary Information Facility",
        url: "https://naif.jpl.nasa.gov/pub/naif/toolkit_docs/C/req/naif_ids.html",
      },
    ],
    startDate: "1976-07-20",
    summary: "Principal successful NASA surface missions, plotted at their reported landing sites.",
  },
] as const;

export const FEATURED_MISSION_NAMES = SOLAR_SYSTEM_MISSIONS.map(({ name }) => name);

export const findSolarMission = (name: string): SolarMissionProfile | null => {
  const normalized = name.trim().toLocaleLowerCase();
  return (
    SOLAR_SYSTEM_MISSIONS.find(
      (mission) =>
        mission.name.toLocaleLowerCase() === normalized ||
        mission.aliases.some((alias) => alias.toLocaleLowerCase() === normalized) ||
        (mission.kind === "trajectory" && mission.spkId === normalized),
    ) ?? null
  );
};
