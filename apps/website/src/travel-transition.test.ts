import { expect, test } from "vite-plus/test";
import {
  arrivalRadius,
  departureRadius,
  easeAway,
  easeDrift,
  easeSettle,
  travelStep,
  TRAVEL_ARRIVAL_SCALE,
  TRAVEL_DEPARTURE_SCALE,
} from "./travel-transition.ts";

test("a leg starts where the camera is and ends where it was sent", () => {
  expect(travelStep(20, 80, 0, 520, easeAway)).toEqual({ radius: 20, settled: false });
  expect(travelStep(20, 80, 520, 520, easeAway)).toEqual({ radius: 80, settled: true });
});

test("a leg that was left running past its end holds at the destination", () => {
  // A backgrounded tab stops being handed frames, so the first one after it returns can be a
  // second late. It has to land, not overshoot.
  expect(travelStep(20, 80, 9_000, 520, easeAway)).toEqual({ radius: 80, settled: true });
  expect(travelStep(80, 20, 9_000, 820, easeSettle)).toEqual({ radius: 20, settled: true });
});

test("a leg with no duration is already over", () => {
  // What a visitor who asked for reduced motion gets: the destination, without the flight.
  expect(travelStep(20, 80, 0, 0, easeAway)).toEqual({ radius: 80, settled: true });
});

test("a departure accelerates away and an arrival brakes into place", () => {
  // The halfway point is what tells the two eases apart: a departure has barely left by then,
  // an arrival is nearly home. Without that asymmetry a jump reads as one linear slide.
  expect(easeAway(0.5)).toBeLessThan(0.25);
  expect(easeSettle(0.5)).toBeGreaterThan(0.75);

  expect(easeAway(0)).toBe(0);
  expect(easeAway(1)).toBe(1);
  expect(easeSettle(0)).toBe(0);
  expect(easeSettle(1)).toBe(1);

  let previousAway = -1;
  let previousSettle = -1;
  for (let step = 0; step <= 20; step += 1) {
    const progress = step / 20;
    expect(easeAway(progress)).toBeGreaterThan(previousAway);
    expect(easeSettle(progress)).toBeGreaterThan(previousSettle);
    previousAway = easeAway(progress);
    previousSettle = easeSettle(progress);
  }
});

test("an ease holds still outside the leg it belongs to", () => {
  expect(easeAway(-3)).toBe(0);
  expect(easeSettle(-3)).toBe(0);
  expect(easeAway(4)).toBe(1);
  expect(easeSettle(4)).toBe(1);
});

test("a departure with nothing behind it scales the distance the visitor was watching from", () => {
  expect(departureRadius(17.2)).toBeCloseTo(17.2 * TRAVEL_DEPARTURE_SCALE, 10);
});

test("a view that cannot be left from far away is departed from no further than it says", () => {
  // The surface vista: a finite patch of ground under a dome. Pulling back the full scale would
  // fly the camera past the edge of the world and show the visitor where it stops.
  expect(departureRadius(12.8, 18.4)).toBe(18.4);
});

test("a limit closer than the visitor already is leaves the camera where it stands", () => {
  // Otherwise a flight *away* would begin by lurching toward the thing being left.
  expect(departureRadius(20, 12)).toBe(20);
});

test("a destination stands nearer than it will settle, so the jump keeps pulling back", () => {
  // The property the whole shape rests on: both halves of a jump travel the same way. An arrival
  // that started outside where it settles would push in, and the jump would read as a retreat
  // followed by an approach rather than as one movement.
  const resting = 17.2;
  expect(arrivalRadius(resting)).toBeLessThan(resting);
  expect(arrivalRadius(resting)).toBeCloseTo(resting * TRAVEL_ARRIVAL_SCALE, 10);
  expect(departureRadius(resting)).toBeGreaterThan(resting);
});

test("a destination never appears nearer than its own view allows", () => {
  // Below this the camera is inside what it came to look at.
  expect(arrivalRadius(17.2, 12)).toBe(12);
  expect(arrivalRadius(17.2, 9)).toBeCloseTo(17.2 * TRAVEL_ARRIVAL_SCALE, 10);
});

test("a nearest distance beyond where the world settles still arrives at the world", () => {
  expect(arrivalRadius(17.2, 40)).toBe(17.2);
});

test("a coast carries the speed it had rather than easing in again", () => {
  expect(easeDrift(0)).toBe(0);
  expect(easeDrift(0.5)).toBe(0.5);
  expect(easeDrift(1)).toBe(1);
  expect(easeDrift(3)).toBe(1);
});
