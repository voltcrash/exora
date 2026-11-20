uniform vec3 skyTint, sunTint, sunDirection;
uniform sampler2D weather;
uniform float air, cover, time;
uniform vec2 seedOffset;
varying vec3 bearing;

float cloudNoise(vec2 uv) {
  vec2 p = vec2(fract(uv.x), abs(fract(uv.y * .5) * 2. - 1.));
  return texture2D(weather, p).r;
}

#ifdef CLOUD_STEPS
uniform sampler2D cloudHeights, billows;
uniform vec2 heightRange;
uniform float cloudExtent;
uniform vec3 cloudLight, cloudDark;
vec2 cloudTopLighting(vec3 p) {
  vec2 form = texture2D(cloudHeights, p.xz / (2. * cloudExtent) + .5).rg;
  vec2 drift = vec2(time * .001, time * -.0004);
  vec2 uv = p.xz * .015 + p.y * vec2(.0021, -.0014) + seedOffset + drift;
  vec3 rolls = texture2D(billows, uv).rgb;
  vec3 curls = texture2D(billows, uv * 3.73 + .18 * rolls.r).rgb;
  float height = mix(heightRange.x, heightRange.y, form.r) + 8. * (rolls.r - .65) + 2.4 * (curls.r - .6);
  vec2 slope = (rolls.gb - .5) + .48 * (curls.gb - .5);
  float light = form.g - .99 * dot(slope, sunDirection.xz);
  return vec2(height, light);
}
vec3 cloudLayer(vec3 ray, vec3 sky) {
  vec3 scattering = vec3(0.);
  float transmission = 1.;
  float previous = 0.;
  float jitter = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(.06711056,.00583715))));
  for (int i = 0; i < CLOUD_STEPS; i++) {
    if (ray.y > 0. && cameraPosition.y + ray.y * previous > heightRange.y + 6.) break;
    float u = float(i + 1) / float(CLOUD_STEPS);
    float end = 200. * u * u;
    float distance = mix(previous, end, .32 + jitter * .36);
    vec3 p = cameraPosition + ray * distance;
    vec2 bank = cloudTopLighting(p);
    float top = bank.x;
    float density = smoothstep(-1.3, 3.1, top - p.y);
    float opacity = 1. - exp(-density * (end - previous) * .31);
    if (opacity > .002) {
      float shade = clamp(bank.y + .065 * (p.y - top), 0., 1.);
      float silver = pow(max(0., dot(ray, sunDirection)), 7.) * (1. - density);
      vec3 tint = mix(cloudDark, cloudLight, .025 + .95 * shade * shade) + sunTint * silver * .24;
      tint = mix(tint, sky, 1. - exp(-distance * .004));
      scattering += transmission * opacity * tint;
      transmission *= 1. - opacity;
    }
    previous = end;
    if (transmission < .018) break;
  }
  return scattering + transmission * sky;
}
#endif

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
    sky = mix(sky, cloud, density * smoothstep(.012,.15,altitude) * min(.82,cover * 1.4) * (1. - .62 * air));
  }
  float opacity = smoothstep(.015,.16,air) + (1. - smoothstep(.015,.16,air)) * air * horizon;
  #ifdef CLOUD_STEPS
    sky = cloudLayer(p, sky);
    opacity = 1.;
  #endif
  gl_FragColor = vec4(sky / (1. + .34 * sky), opacity);
  #include <colorspace_fragment>
}
