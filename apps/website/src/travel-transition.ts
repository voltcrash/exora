/**
 * The flight between two destinations, in place of a loading screen.
 *
 * Travelling from a world to its host star used to be covered by an opaque card with a spinner on
 * it. The world you were leaving vanished, a panel said what was being calculated, and the next
 * destination cut in from behind it — three seconds of interface saying nothing except that the
 * two places had nothing to do with each other. They are in the same sky, and the renderer they
 * are drawn by is the same one throughout, so the jump is flown rather than announced.
 *
 * A flight has three legs. The camera pulls away from the world being left, accelerating as it
 * goes. The screen darkens for the one moment that cannot be flown through — building a
 * destination is a few thousand lines of synchronous geometry and shader work, which stalls the
 * frame loop for as long as it runs, so the frame the compositor holds through the stall is made
 * a dark one deliberately. Then the camera falls back in toward the new world and settles on it.
 *
 * The timings live here, apart from both the renderer that flies them and the stylesheet that has
 * to darken in step, so those two halves cannot drift out of agreement with each other.
 */

/** Where a jump has got to. Anything but `idle` means the visitor is between destinations. */
export type TravelPhase = "idle" | "departing" | "crossing" | "arriving";

/** How far a departure pulls back, as a multiple of the distance the visitor was watching from. */
export const TRAVEL_DEPARTURE_SCALE = 4.6;

/** Pulling away from the world being left. */
export const TRAVEL_DEPART_MS = 520;
/** Darkening over the swap itself, which is the part no camera move can cover. */
export const TRAVEL_CROSS_MS = 190;
/** Falling in toward the destination. */
export const TRAVEL_ARRIVE_MS = 820;
/** Clearing the dark, once there is a world behind it to be seen. */
export const TRAVEL_REVEAL_MS = 300;
/** Flying back to a world the visitor turned out not to be able to leave. */
export const TRAVEL_RECALL_MS = 420;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/** Slowest at the start and quickest at the end, so a departure reads as accelerating away. */
export const easeAway = (progress: number): number => clampUnit(progress) ** 3;

/** Quickest at the start and slowest at the end, so an arrival reads as braking into place. */
export const easeSettle = (progress: number): number => 1 - (1 - clampUnit(progress)) ** 3;

export interface TravelStep {
  /** How far the camera stands from what it is watching, this instant. */
  radius: number;
  /** Whether the leg has played all the way out. */
  settled: boolean;
}

/**
 * One frame of a leg.
 *
 * Progress is taken from the clock rather than counted in frames, so a flight lasts as long as it
 * is supposed to whether the page is drawing at 120 Hz or dropping frames to a texture upload —
 * and a tab that was backgrounded mid-jump resumes where the clock says it should be rather than
 * where it left off.
 */
export const travelStep = (
  from: number,
  to: number,
  elapsedMs: number,
  durationMs: number,
  ease: (progress: number) => number,
): TravelStep => {
  const progress = durationMs > 0 ? clampUnit(elapsedMs / durationMs) : 1;
  return { radius: from + (to - from) * ease(progress), settled: progress >= 1 };
};

/**
 * Where a departure from `radius` is aiming.
 *
 * `farthest` is the world's own word on how far back it can stand being watched from, and is
 * never allowed to pull the camera *inward*: a view whose limit is closer than where the visitor
 * already is would otherwise turn the flight away into a lurch toward the thing being left.
 */
export const departureRadius = (radius: number, farthest?: number): number =>
  Math.min(radius * TRAVEL_DEPARTURE_SCALE, Math.max(radius, farthest ?? Number.POSITIVE_INFINITY));
