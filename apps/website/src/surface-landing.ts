export const SURFACE_EYE_HEIGHT = 1.65;
export const SURFACE_WALK_LIMIT = 106;

export const chooseSurfaceLanding = (
  floor: (x: number, z: number) => number,
  water: number,
  sun: { x: number; z: number },
) => {
  let best = { x: 0, z: 5, yaw: -0.22 };
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const [x, z] of [
    [0, 5],
    [-10, -10],
    [0, -12],
    [10, -10],
    [-16, 4],
    [16, 4],
    [-10, 15],
    [0, 17],
    [10, 15],
  ] as const) {
    const ground = floor(x, z);
    const eye = ground + SURFACE_EYE_HEIGHT;
    const wet = ground <= water + 0.04 ? 0.26 : 0;
    const uneven =
      Math.max(Math.abs(floor(x + 1, z) - ground), Math.abs(floor(x, z + 1) - ground)) * 0.2;

    for (let step = 0; step < 24; step += 1) {
      const yaw = (step / 24) * 2 * Math.PI;
      let interest = 0;
      for (const offset of [-0.31, 0, 0.31]) {
        const dx = Math.sin(yaw + offset);
        const dz = -Math.cos(yaw + offset);
        let skyline = -1;
        let open = 0;
        let backdrop = 0;
        let shapes = 0;
        let previousHeight = ground;
        for (const distance of [4, 9, 16, 27, 44, 68, 99, 146]) {
          const height = floor(x + dx * distance, z + dz * distance);
          const angle = (height - eye) / distance;
          if (distance <= 16) open += Math.max(0, angle - 0.035);
          if (distance >= 16 && angle > skyline - 0.033) {
            shapes += Math.min(0.13, Math.abs(height - previousHeight) / distance);
            if (distance >= 27) backdrop = Math.max(backdrop, angle);
          }
          skyline = Math.max(skyline, angle);
          previousHeight = height;
        }
        interest += shapes * 0.95 + Math.min(0.17, backdrop) * 0.76 - open * 1.8;
      }
      const glare = Math.max(0, Math.sin(yaw) * sun.x - Math.cos(yaw) * sun.z);
      const score = interest - glare ** 4 * 0.21 - wet - uneven - Math.hypot(x, z - 5) * 0.001;
      if (score > bestScore) {
        bestScore = score;
        best = { x, z, yaw };
      }
    }
  }

  return best;
};
