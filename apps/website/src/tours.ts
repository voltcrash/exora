/*
 * GUIDED TOURS
 *
 * A tour is an ordered list of real destinations with one sentence each — a reason to look, not a
 * lecture. Every step is an ordinary destination URL with `tour` and `step` added, so a tour can be
 * shared, bookmarked, resumed with the back button, and left at any moment simply by going
 * somewhere else. The captions state only what the archives or mission records support.
 */

export type TourDestinationKind = "blackHole" | "planet" | "region" | "star" | "system";

export interface TourStep {
  caption: string;
  kind: TourDestinationKind;
  name: string;
}

export interface Tour {
  id: string;
  steps: readonly TourStep[];
  summary: string;
  title: string;
}

export const TOURS: readonly Tour[] = [
  {
    id: "home-to-the-edge",
    steps: [
      {
        caption:
          "Home: the one world known to hold life, and the yardstick every reading in Exora is measured against.",
        kind: "planet",
        name: "Earth",
      },
      {
        caption: "Our companion, 384,400 km away, and the only other world people have walked on.",
        kind: "planet",
        name: "Moon",
      },
      {
        caption:
          "More than twice as massive as every other planet combined; its pull shapes the asteroid belt and herds the Trojan clouds.",
        kind: "planet",
        name: "Jupiter",
      },
      {
        caption:
          "Where the solar wind gives way to interstellar space, about 120 AU out. Voyager 1 crossed it in 2012.",
        kind: "region",
        name: "Heliopause",
      },
      {
        caption:
          "The nearest star to the Sun, 4.2 light-years away: a red dwarf too faint to see without a telescope.",
        kind: "star",
        name: "Proxima Centauri",
      },
      {
        caption:
          "At least as massive as Earth, inside its star's habitable zone, on an orbit of just 11.2 days.",
        kind: "planet",
        name: "Proxima Cen b",
      },
      {
        caption:
          "Seven Earth-sized worlds, every one closer to its star than Mercury is to the Sun, locked in a chain of resonances.",
        kind: "system",
        name: "TRAPPIST-1",
      },
      {
        caption:
          "Four million Suns in a region smaller than Mercury's orbit: the black hole at the centre of the Milky Way.",
        kind: "blackHole",
        name: "Sagittarius A*",
      },
    ],
    summary:
      "From Earth to the nearest star, the nearest worlds beyond it, and the galaxy's heart.",
    title: "Home to the edge",
  },
  {
    id: "trappist-1",
    steps: [
      {
        caption: "An ultracool red dwarf and seven rocky worlds, 40 light-years from the Sun.",
        kind: "system",
        name: "TRAPPIST-1",
      },
      {
        caption:
          "Barely larger than Jupiter and about 2,600 K, the star shines mostly in the infrared.",
        kind: "star",
        name: "TRAPPIST-1",
      },
      {
        caption: "The innermost world, circling its star once every day and a half.",
        kind: "planet",
        name: "TRAPPIST-1 b",
      },
      {
        caption:
          "The most Earth-like of the seven in size and sunlight: 0.92 Earth radii, about two-thirds of Earth's stellar flux.",
        kind: "planet",
        name: "TRAPPIST-1 e",
      },
      {
        caption: "The outermost, taking nineteen days to go round, on the cold edge of the system.",
        kind: "planet",
        name: "TRAPPIST-1 h",
      },
    ],
    summary: "Seven worlds around one small, cool star, visited from the inside out.",
    title: "The seven worlds of TRAPPIST-1",
  },
  {
    id: "extremes",
    steps: [
      {
        caption:
          "A super-Earth that circles its star in under eighteen hours, hot enough that its dayside may be molten.",
        kind: "planet",
        name: "55 Cnc e",
      },
      {
        caption:
          "A hot Jupiter so close to its star that its orbit is measurably shrinking under the star's tides.",
        kind: "planet",
        name: "WASP-12 b",
      },
      {
        caption: "A world with two suns: it orbits both stars of a close binary.",
        kind: "planet",
        name: "Kepler-16 b",
      },
      {
        caption:
          "A young giant about 92 AU from its star, among the first exoplanets imaged by the James Webb Space Telescope.",
        kind: "planet",
        name: "HIP 65426 b",
      },
      {
        caption:
          "A red supergiant so swollen that, in the Sun's place, it would reach beyond the orbit of Mars.",
        kind: "star",
        name: "Betelgeuse",
      },
      {
        caption: "One of the most massive black holes known, tens of billions of times the Sun.",
        kind: "blackHole",
        name: "TON 618",
      },
    ],
    summary: "The fastest, hottest, strangest and largest the archives hold.",
    title: "Worlds at the extremes",
  },
];

export const findTour = (id: string): Tour | undefined => TOURS.find((tour) => tour.id === id);

/** The destination URL search for one step of a tour, carrying the tour along with it. */
export const tourStepSearch = (tour: Tour, index: number): string => {
  const step = tour.steps[index];
  if (!step) return "";
  const parameters = new URLSearchParams();
  parameters.set(step.kind, step.name);
  parameters.set("tour", tour.id);
  parameters.set("step", String(index + 1));
  return `?${parameters.toString()}`;
};

export interface ActiveTour {
  index: number;
  tour: Tour;
}

/** The tour a destination URL belongs to, if its step still matches the destination shown. */
export const readTour = (search: string): ActiveTour | null => {
  const parameters = new URLSearchParams(search);
  const tour = findTour(parameters.get("tour") ?? "");
  if (!tour) return null;
  const index = Number.parseInt(parameters.get("step") ?? "", 10) - 1;
  const step = tour.steps[index];
  if (!step || parameters.get(step.kind) !== step.name) return null;
  return { index, tour };
};
