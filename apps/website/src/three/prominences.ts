import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from "three";

export function createProminences(radius: number, tint: Color, activity: number, seed: number) {
  const vertices: number[] = [],
    colors: number[] = [];
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const baseTint = tint.clone().lerp(new Color(1, 0.16, 0.035), 0.48);
  for (let i = 0; i < Math.round(8 + activity * 42); i++) {
    const longitude = random() * Math.PI * 2,
      latitude = (random() - 0.5) * 1.55;
    const normal = new Vector3(
      Math.cos(latitude) * Math.cos(longitude),
      Math.sin(latitude),
      Math.cos(latitude) * Math.sin(longitude),
    );
    const tangent = new Vector3(-Math.sin(longitude), 0, Math.cos(longitude)).applyAxisAngle(
      normal,
      random() * Math.PI,
    );
    const width = 0.02 + 0.12 * random(),
      height = 0.025 + activity * 0.18 * random();
    for (let strand = 0; strand < 5; strand++) {
      for (let j = 0; j < 30; j++)
        for (const t of [j / 30, (j + 1) / 30]) {
          const arch = Math.sin(t * Math.PI),
            side = (strand - 2) * 0.025;
          const point = normal
            .clone()
            .addScaledVector(tangent, (t * 2 - 1) * width * (1 + side))
            .normalize()
            .multiplyScalar(radius * (0.996 + height * arch * (1 - side)));
          vertices.push(point.x, point.y, point.z);
          const gain = 0.5 + 0.5 * (1 - arch);
          colors.push(baseTint.r * gain, baseTint.g * gain, baseTint.b * gain);
        }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const material = new LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    blending: AdditiveBlending,
  });
  return new LineSegments(geometry, material);
}
