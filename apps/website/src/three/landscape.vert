attribute vec4 masks;
attribute vec2 shade;
varying vec3 groundPoint, groundNormal;
varying vec4 surfaceMask;
varying vec2 terrainShade;

void main() {
  groundPoint = position;
  groundNormal = normal;
  surfaceMask = masks;
  terrainShade = shade;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.);
}
