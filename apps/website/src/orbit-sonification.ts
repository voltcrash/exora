/*
 * LISTENING TO A SYSTEM
 *
 * Each world is given a pitch in proportion to its orbital frequency, 1/P, so the ratio between
 * any two notes is the ratio between their orbits. The whole set is then folded up by octaves
 * into a range a speaker can play — octave folding keeps every interval's pitch class, so worlds
 * locked in a 3:2 resonance still sound a fifth apart. A world plucks its note as it crosses
 * Earth's line of sight, the moment it would transit, so a resonant chain is heard as a rhythm
 * that repeats and an unrelated set as one that never settles.
 */

export const LOWEST_HZ = 130.81;
export const HIGHEST_HZ = 1_046.5;

/** Pitches in hertz for orbital periods in days; null periods stay silent. */
export const orbitPitches = (periodsDays: readonly (number | null)[]): (number | null)[] => {
  const periods = periodsDays.filter((period): period is number => period !== null && period > 0);
  if (periods.length === 0) return periodsDays.map(() => null);
  const shortest = Math.min(...periods);
  return periodsDays.map((period) => {
    if (period === null || period <= 0) return null;
    let pitch = HIGHEST_HZ * (shortest / period);
    while (pitch < LOWEST_HZ) pitch *= 2;
    return pitch;
  });
};

/** How a pitch ratio would be written as a simple interval, to within a percent. */
export const nearestSimpleRatio = (ratio: number, maximumTerm = 9): string | null => {
  const normalized = ratio >= 1 ? ratio : 1 / ratio;
  for (let denominator = 1; denominator <= maximumTerm; denominator += 1) {
    const numerator = Math.round(normalized * denominator);
    if (numerator > maximumTerm || numerator === 0) continue;
    if (Math.abs(numerator / denominator - normalized) / normalized < 0.01) {
      return `${String(numerator)}:${String(denominator)}`;
    }
  }
  return null;
};

export interface OrbitVoice {
  dispose: () => void;
  pluck: (pitchHz: number, pan: number) => void;
}

/** A soft plucked voice. Must be created from a user gesture so the browser allows audio. */
export const createOrbitVoice = (): OrbitVoice | null => {
  const AudioContextClass = window.AudioContext;
  if (typeof AudioContextClass !== "function") return null;
  const context = new AudioContextClass();
  const master = context.createGain();
  master.gain.value = 0.22;
  const compressor = context.createDynamicsCompressor();
  master.connect(compressor);
  compressor.connect(context.destination);

  return {
    dispose: () => {
      void context.close();
    },
    pluck: (pitchHz, pan) => {
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0.0001, now);
      envelope.gain.exponentialRampToValueAtTime(1, now + 0.008);
      envelope.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
      const panner = context.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, pan));
      envelope.connect(panner);
      panner.connect(master);
      for (const [multiple, level] of [
        [1, 0.7],
        [2, 0.18],
        [3, 0.06],
      ] as const) {
        const oscillator = context.createOscillator();
        const partial = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.value = pitchHz * multiple;
        partial.gain.value = level;
        oscillator.connect(partial);
        partial.connect(envelope);
        oscillator.start(now);
        oscillator.stop(now + 1.7);
      }
    },
  };
};
