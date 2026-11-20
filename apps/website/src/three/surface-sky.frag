uniform vec3 skyTint, sunTint, sunDirection;
uniform sampler2D weather;
uniform float air, cover, time;
uniform vec2 seedOffset;
varying vec3 bearing;

float cloudNoise(vec2 uv) {
  vec2 p = vec2(fract(uv.x), abs(fract(uv.y * .5) * 2. - 1.));
  return texture2D(weather, p).r;
}

void main() {
  vec3 p = normalize(bearing);
  float altitude = max(0., p.y);
  float horizon = exp(-altitude * 4.8);
  float towardSun = max(0., dot(p, sunDirection));
  vec3 zenith = pow(max(skyTint, vec3(.001)), vec3(1.65)) * .76;
  vec3 haze = skyTint * .61 + sunTint * air * .075;
  vec3 sky = mix(zenith, haze, horizon);
  sky += sunTint * air * (.19 * pow(towardSun, 12.) + .44 * pow(towardSun, 180.));
  if (cover > .015 && altitude > .012) {
    vec2 plane = p.xz / (.09 + altitude) * .29 + seedOffset + vec2(time * .0007, 0.);
    float body = cloudNoise(plane);
    float folds = cloudNoise(plane * 2.73 + vec2(.083, .17) * body);
    float wisps = cloudNoise(plane * 8.6 + folds * .15);
    float field = .55 * body + .32 * folds + .13 * wisps;
    float density = smoothstep(.68 - cover * .23, .76 - cover * .22, field);
    float sunSide = cloudNoise(plane + sunDirection.xz * .031) - body;
    vec3 cloud = mix(skyTint * .58, sunTint * .96, clamp(.51 + sunSide * 2.6 + .27 * wisps, 0., 1.));
    sky = mix(sky, cloud, density * smoothstep(.012,.15,altitude) * min(.91,cover * 1.6));
  }
  float opacity = smoothstep(.015,.16,air) + (1. - smoothstep(.015,.16,air)) * air * horizon;
  gl_FragColor = vec4(sky / (1. + .34 * sky), opacity);
  #include <colorspace_fragment>
}
