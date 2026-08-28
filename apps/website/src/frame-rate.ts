export type SignalStrength = 0 | 1 | 2 | 3 | 4;

export const frameRateStrength = (fps: string): SignalStrength => {
  const reading = Number.parseFloat(fps);
  if (!Number.isFinite(reading)) return 0;
  if (reading >= 55) return 4;
  if (reading >= 40) return 3;
  if (reading >= 25) return 2;
  return 1;
};
