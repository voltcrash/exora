varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vEye;
void main() {
  vLocal = normal;
  vNormal = normalMatrix * normal;
  vec4 eye = modelViewMatrix * vec4(position, 1.0);
  vEye = -eye.xyz;
  gl_Position = projectionMatrix * eye;
}
