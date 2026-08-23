/**
 * The flight between two destinations, in place of a loading screen.
 *
 * Travelling from a world to its host star used to be covered by an opaque card with a spinner on
 * it. The world you were leaving vanished, a panel said what was being calculated, and the next
 * destination cut in from behind it — three seconds of interface saying nothing except that the
 * two places had nothing to do with each other. They are in the same sky, and the renderer they
 * are drawn by is the same one throughout, so the jump is flown rather than announced.
 *
 * A flight is one move in one direction, and its shape is chosen so that it stays that way:
 *
 * - The camera pulls away from the world being left, accelerating as it goes. If the destination
 *   is still being fetched when that runs out, the pull-away keeps drifting rather than stopping
 *   dead, because a camera that freezes mid-jump reads as a page that has hung.
 * - The screen darkens for the one moment that cannot be flown through: building a destination is
 *   a few thousand lines of synchronous geometry and shader work, which stalls the frame loop for
 *   as long as it runs, so the frame the compositor holds through the stall is deliberately made
 *   a dark one.
 * - The destination is then *already close*, and the camera keeps pulling back until it settles
 *   into frame. It is the same direction of travel as the half before the dark, which is what
 *   makes the two halves read as one movement. Flying out and then flying back in reads instead
 *   as a retreat followed by an approach — the jump appears to change its mind in the middle.
 *
 * The timings live here, apart from both the renderer that flies them and the stylesheet that has
 * to darken in step, so those two halves cannot drift out of agreement with each other.
 */

/** Where a jump has got to. Anything but `idle` means the visitor is between destinations. */
export type TravelPhase = "idle" | "departing" | "crossing" | "arriving";

/** How far a departure pulls back, as a multiple of the distance the visitor was watching from. */
export const TRAVEL_DEPARTURE_SCALE = 4.1;
/** How close a destination is when it appears, as a fraction of where it will settle. */
export const TRAVEL_ARRIVAL_SCALE = 0.62;
/** How much further a pull-away drifts while it waits for an archive that has not answered. */
export const TRAVEL_COAST_SCALE = 1.5;

/** Pulling away from the world being left. */
export const TRAVEL_DEPART_MS = 420;
/** Drifting on, for a destination that is taking its time. */
export const TRAVEL_COAST_MS = 3_200;
/** Darkening over the swap itself, which is the part no camera move can cover. */
export const TRAVEL_CROSS_MS = 150;
/** Settling the destination into frame. */
export const TRAVEL_ARRIVE_MS = 620;
/** Clearing the dark, once there is a world behind it to be seen. */
export const TRAVEL_REVEAL_MS = 240;
/** Flying back to a world the visitor turned out not to be able to leave. */
export const TRAVEL_RECALL_MS = 380;

/**
 * The descent to a world's surface, and the climb back to orbit, take the same shape.
 *
 * Nothing is fetched or rebuilt — both halves of a world are already in the scene — but the two
 * halves share no geometry at all: an orbital view is a body seen whole from space, a surface
 * vista is a patch of ground under its own sky. There is no camera move that carries one into
 * the other, so the swap is hidden the same way a jump between destinations hides its own, and
 * the camera keeps moving the way the visitor's scroll was already taking it, through and out
 * the other side. Everything discontinuous — the ground, the sky, the fog, where the camera is
 * pointing — happens at the single instant the dark is deepest.
 */
export const SURFACE_TRANSITION_MS = 760;
/** How far through the descent that instant falls. The stylesheet holds the dark across it. */
export const SURFACE_SWAP_AT = 0.5;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

/** Slowest at the start and quickest at the end, so a departure reads as accelerating away. */
export const easeAway = (progress: number): number => clampUnit(progress) ** 3;

/** Quickest at the start and slowest at the end, so an arrival reads as braking into place. */
export const easeSettle = (progress: number): number => 1 - (1 - clampUnit(progress)) ** 3;

/** No easing at all: a coast carries the speed it already had rather than starting again. */
export const easeDrift = (progress: number): number => clampUnit(progress);

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

/**
 * How close a destination stands when the dark clears off it.
 *
 * Inside where it will settle, so that the second half of the jump carries on pulling back in the
 * direction the first half was already going. `closest` is the nearest the view allows — every
 * scene keeps one, because it is the distance below which the camera would be inside what it is
 * looking at — and it wins over the fraction whenever the two disagree.
 */
export const arrivalRadius = (resting: number, closest?: number): number =>
  Math.max(resting * TRAVEL_ARRIVAL_SCALE, Math.min(resting, closest ?? 0));
