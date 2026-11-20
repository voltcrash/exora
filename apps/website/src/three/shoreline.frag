uniform vec3 deepColor, shallowColor, skyTint, sunTint, sunDirection;
uniform float air, time;
varying vec3 waterPoint;
varying float depth;

void main() {
  if (depth <= .002) discard;
  vec2 p = waterPoint.xz;
  vec3 towardEye = cameraPosition - waterPoint;
  float distanceToEye = length(towardEye);
  vec3 V = normalize(towardEye);
  float smallWaves = exp(-distanceToEye * .036);
  float swell = sin(dot(p, vec2(.63, .38)) - time * 1.18);
  float crossWave = sin(dot(p, vec2(-.49, 1.12)) - time * .86);
  float ripple = sin(dot(p, vec2(2.71, 1.91)) + swell * .72 - time * 2.48);
  vec3 N = normalize(vec3(
    .04 * swell + .017 * ripple * smallWaves,
    1.,
    .032 * crossWave + .019 * ripple * smallWaves
  ));
  float fresnel = .025 + .63 * pow(1. - clamp(dot(V, N), 0., 1.), 5.);
  vec3 liquid = mix(shallowColor, deepColor, 1. - exp(-depth * 1.82));
  vec3 reflection = skyTint * (.32 + .25 * (1. - V.y));
  float glint = pow(max(0., dot(N, normalize(sunDirection + V))), 145.);
  vec3 water = mix(liquid, reflection, fresnel) + sunTint * glint * .76;
  float shore = 1. - smoothstep(.015, .19, depth);
  water += shallowColor * shore * (.21 + .28 * smoothstep(.1, .8, ripple));
  float haze = 1. - exp(-distanceToEye * air * .013);
  gl_FragColor = vec4(mix(water, skyTint * .49, .93 * haze), 1.);
  #include <colorspace_fragment>
}
