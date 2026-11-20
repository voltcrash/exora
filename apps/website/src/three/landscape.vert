#include <common>
#include <shadowmap_pars_vertex>

attribute vec4 masks;
attribute vec2 shade;
varying vec3 groundPoint, groundNormal;
varying vec4 surfaceMask;
varying vec2 terrainShade;

void main() {
  vec4 worldPosition = modelMatrix * vec4(position, 1.);
  vec4 mvPosition = viewMatrix * worldPosition;
  vec3 transformedNormal = normalize(normalMatrix * normal);
  groundPoint = worldPosition.xyz;
  groundNormal = transformNormalByInverseViewMatrix(transformedNormal, viewMatrix);
  surfaceMask = masks;
  terrainShade = shade;
  gl_Position = projectionMatrix * mvPosition;
  #include <shadowmap_vertex>
}
