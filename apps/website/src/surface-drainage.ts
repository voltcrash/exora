// Route runoff across the sampled mesh. Cell area and slope are in world units on the graded grid.
export function inciseDrainage(
  heights: Float32Array,
  positions: Float32Array,
  resolution: number,
  strength: number,
) {
  const stride = resolution + 1;
  const downstream = new Int32Array(heights.length).fill(-1);
  const slope = new Float32Array(heights.length);
  const area = new Float32Array(heights.length);
  const axis = Float32Array.from({ length: stride }, (_, i) => positions[i * 3]!);
  const width = axis.map(
    (_, i) => (axis[Math.min(resolution, i + 1)]! - axis[Math.max(0, i - 1)]!) * 0.5,
  );
  for (let row = 1; row < resolution; row++) {
    for (let col = 1; col < resolution; col++) {
      const i = row * stride + col;
      area[i] = width[row]! * width[col]!;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          const target = i + dz * stride + dx;
          const drop = heights[i]! - heights[target]!;
          if (drop <= 0) continue;
          const runX = axis[col + dx]! - axis[col]!,
            runZ = axis[row + dz]! - axis[row]!;
          const gradient = drop / Math.sqrt(runX * runX + runZ * runZ);
          if (gradient <= slope[i]!) continue;
          slope[i] = gradient;
          downstream[i] = target;
        }
      }
    }
  }
  const byHeight = Uint32Array.from(heights, (_, i) => i).sort((a, b) => heights[b]! - heights[a]!);
  for (const i of byHeight) {
    const target = downstream[i]!;
    if (target < 0) continue;
    area[target] = area[target]! + area[i]!;
    const incision = Math.log1p(area[i]! * 0.13) * Math.min(1.3, slope[i]!) * strength;
    heights[i] = heights[i]! - Math.min(2.6, incision);
  }
}
