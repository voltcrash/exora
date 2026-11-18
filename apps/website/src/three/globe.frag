uniform sampler2D strata;
uniform sampler2D flow;
uniform vec3 lowColor;
uniform vec3 midColor;
uniform vec3 highColor;
uniform vec3 waterColor;
uniform vec3 airColor;
uniform vec3 sunlight;
uniform vec3 lightDirection;
uniform bool unresolved;
uniform float seed;
uniform float water;
uniform float ice;
uniform float cloud;
uniform float lava;
uniform float bands;
uniform float contrast;
uniform float warp;
uniform float veil;
uniform float stormScale;
uniform float stormCount;
uniform float stormLatitude;
uniform float stormStrength;
uniform vec3 stormColor;
uniform float air;
uniform float time;
varying vec3 vLocal;
varying vec3 vNormal;
varying vec3 vEye;

vec2 globeUv(vec3 p) {
  p = normalize(p);
  return vec2(atan(p.z, p.x) / 6.2831853 + 0.5, asin(clamp(p.y, -1.0, 1.0)) / 3.14159265 + 0.5);
}
vec4 field(sampler2D tex, vec2 uv) {
  vec2 dx = dFdx(uv), dy = dFdy(uv);
  // Longitude wraps once around the globe. Use its shortest differential for mip selection.
  dx.x -= floor(dx.x + 0.5);
  dy.x -= floor(dy.x + 0.5);
  return textureGrad(tex, uv, dx, dy);
}
vec3 cloudDeck(vec3 p) {
  vec2 uv = globeUv(p);
  float latitude = uv.y - 0.5;
  float cycle = fract(time / 2048.0);
  float shearOffset = 0.014 * sin(cycle * 6.2831853);
  float zone = latitude * bands * 0.87 + seed * 6.28;
  uv.x += seed + cycle + shearOffset * sin(zone);
  float eyeMask = 0.0;
  for (int i = 0; i < 3; i++) {
    if (float(i) >= stormCount) break;
    float id = float(i);
    vec2 center = vec2(0.75 + fract(seed * 7.13) + id * 0.382, 0.5 + stormLatitude * 0.28);
    center.y += id == 1.0 ? 0.19 : (id == 2.0 ? -0.12 : 0.0);
    vec2 delta = vec2(fract(uv.x - center.x + 0.5) - 0.5, uv.y - center.y);
    vec2 size = vec2(0.010, 0.006) * stormScale / (1.0 + id * 0.65);
    vec2 ellipse = delta / size;
    float radius = dot(ellipse, ellipse);
    float swirl = exp(-radius * 0.66) * stormStrength * 4.8;
    mat2 spin = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl));
    uv += (spin * ellipse - ellipse) * size;
    if (i == 0) eyeMask = exp(-radius * 1.7);
  }

  vec3 weather = field(flow, uv).rgb;
  vec2 shearUv = vec2(uv.x + 0.074 * sin(zone + 2.5 * weather.g),
                       uv.y + warp * (weather.r - 0.5) * 0.039);
  vec3 shear = field(flow, shearUv).rgb;
  float boundary = (shearUv.y - 0.5) * bands * 0.87;
  boundary += 1.42 * sin(latitude * 15.0 + seed * 4.7) + 0.66 * sin(latitude * 35.0 - seed * 2.4);
  float belt = 0.5 + 0.5 * sin(boundary);
  float broad = 0.5 + 0.5 * sin(latitude * 25.0 - 0.8 + seed * 3.0);
  float filaments = sin(boundary * 4.7 + shear.g * 6.0 + weather.r * 2.0);
  float cloudHeight = 0.17 + 0.40 * belt + 0.18 * broad + 0.26 * shear.r + 0.10 * filaments;
  cloudHeight = mix(0.55, cloudHeight, contrast);
  vec3 belts = mix(lowColor, midColor, smoothstep(0.0, 0.54, cloudHeight));
  belts = mix(belts, highColor, smoothstep(0.34, 0.87, cloudHeight));
  float pole = smoothstep(0.25, 0.48, abs(latitude));
  belts = mix(belts, mix(midColor, highColor, 0.27), pole * 0.55);
  belts = mix(belts, stormColor, eyeMask * stormStrength * (0.64 + 0.36 * shear.b));
  vec3 haze = mix(midColor, highColor, 0.28 + 0.17 * p.y);
  return mix(belts, haze, veil) * (0.94 + 0.12 * shear.b);
}

void main() {
  vec3 p = normalize(vLocal);
  float offset = seed * 6.2831853;
  vec3 q = normalize(p + 0.16 * sin(p.yzx * 4.0 + offset) + 0.09 * cos(p.zxy * 7.0 - offset));
  vec2 uv = globeUv(q);
  uv.x += seed;
  vec3 weather = field(flow, vec2(uv.x + time * 0.0018, uv.y)).rgb;
  vec3 plate = field(strata, uv).rgb;
  vec3 n = normalize(vNormal);
  vec3 eye = normalize(vEye);
  vec3 light = normalize(lightDirection);
  float mu = max(0.0, dot(n, eye));
  float direct = dot(n, light);
  float day = max(direct, 0.0);
  float shore = water;
  float land = water <= 0.0 ? 1.0 : smoothstep(shore - 0.008, shore + 0.008, plate.r);
  float altitude = smoothstep(shore, 0.9, plate.r);
  vec3 stone = mix(lowColor, midColor, clamp(plate.r * 1.15 + plate.b * 0.14, 0.0, 1.0));
  stone = mix(stone, highColor, altitude * (0.4 + plate.g * 0.6));
  stone *= 0.72 + plate.g * 0.18 + plate.b * 0.30;
  vec3 sea = waterColor * mix(0.42, 1.35, smoothstep(shore - 0.13, shore, plate.r));
  vec3 albedo = mix(sea, stone, land);
  float frost = smoothstep(0.99 - ice * 0.50, 1.05 - ice * 0.2, abs(p.y) + plate.g * 0.05);
  albedo = mix(albedo, vec3(0.74, 0.88, 0.94), frost * min(1.0, ice * 3.0));
  float cover = smoothstep(0.91 - cloud * 0.48, 1.0 - cloud * 0.39, weather.r + 0.09 * weather.b);
  albedo = mix(albedo, vec3(0.88, 0.90, 0.93), cover * min(cloud * 4.0, 1.0));
  float specular = (1.0 - land) * (1.0 - cover) * pow(max(dot(n, normalize(eye + light)), 0.0), 60.0);
  vec3 volcanic = vec3(1.6, 0.23, 0.025) * lava * pow(plate.g, 7.0) * land;
  if (bands > 0.0) {
    albedo = cloudDeck(p);
    specular = 0.0;
    volcanic = vec3(0.0);
  }
  if (unresolved) { albedo = midColor; specular = 0.; volcanic = vec3(0.); }
  float scatter = pow(1.0 - mu, 3.8) * smoothstep(-0.35, 0.75, direct);
  vec3 color = albedo * (vec3(0.015, 0.023, 0.038) + sunlight * day * 1.55)
             + specular * 0.42 * day * sunlight + volcanic + airColor * air * scatter;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
