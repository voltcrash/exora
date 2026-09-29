import { expect, test } from "vite-plus/test";
import { findBlackHole } from "./black-holes.ts";
import { findSolarRegion } from "./solar-regions.ts";
import { findSolarWorld } from "./solar-system.ts";
import { readTour, TOURS, tourStepSearch } from "./tours.ts";

test("every step's URL carries the destination and reads back as the same step", () => {
  for (const tour of TOURS) {
    tour.steps.forEach((step, index) => {
      const search = tourStepSearch(tour, index);
      expect(new URLSearchParams(search).get(step.kind)).toBe(step.name);
      expect(readTour(search)).toEqual({ index, tour });
    });
  }
});

test("bundled destinations in a tour resolve without the network", () => {
  for (const step of TOURS.flatMap((tour) => tour.steps)) {
    if (step.kind === "region") expect(findSolarRegion(step.name)).toBeDefined();
    if (step.kind === "blackHole") expect(findBlackHole(step.name)).toBeDefined();
    if (step.kind === "planet" && ["Earth", "Moon", "Jupiter"].includes(step.name)) {
      expect(findSolarWorld(step.name)).not.toBeNull();
    }
  }
});

test("leaving a tour's destination leaves the tour", () => {
  const [tour] = TOURS;
  const search = new URLSearchParams(tourStepSearch(tour!, 0));
  search.set("planet", "Mars");

  expect(readTour(`?${search.toString()}`)).toBeNull();
  expect(readTour("?tour=unknown&step=1&planet=Earth")).toBeNull();
  expect(readTour("?planet=Earth")).toBeNull();
});

test("captions stay a sentence long", () => {
  for (const step of TOURS.flatMap((tour) => tour.steps)) {
    expect(step.caption.length).toBeLessThanOrEqual(140);
  }
});
