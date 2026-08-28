export type TravelPhase = "idle" | "departing" | "crossing" | "arriving";

export const TRAVEL_DEPARTURE_SCALE = 4.1;
export const TRAVEL_ARRIVAL_SCALE = 0.62;
export const TRAVEL_COAST_SCALE = 1.5;

export const TRAVEL_DEPART_MS = 420;
export const TRAVEL_COAST_MS = 3_200;
export const TRAVEL_CROSS_MS = 150;
export const TRAVEL_ARRIVE_MS = 620;
export const TRAVEL_REVEAL_MS = 240;
export const TRAVEL_RECALL_MS = 380;

export const SURFACE_TRANSITION_MS = 760;
export const SURFACE_SWAP_AT = 0.5;

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

export const easeAway = (progress: number): number => clampUnit(progress) ** 3;

export const easeSettle = (progress: number): number => 1 - (1 - clampUnit(progress)) ** 3;

export const easeDrift = (progress: number): number => clampUnit(progress);

export interface TravelStep {
  radius: number;
  settled: boolean;
}

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

export const departureRadius = (radius: number, farthest?: number): number =>
  Math.min(radius * TRAVEL_DEPARTURE_SCALE, Math.max(radius, farthest ?? Number.POSITIVE_INFINITY));

export const arrivalRadius = (resting: number, closest?: number): number =>
  Math.max(resting * TRAVEL_ARRIVAL_SCALE, Math.min(resting, closest ?? 0));
