uniform sampler2D strata;
uniform sampler2D flow;
uniform vec3 lowColor;
uniform vec3 midColor;
uniform vec3 highColor;
uniform vec3 waterColor;
uniform vec3 airColor;
uniform vec3 sunlight;
uniform vec3 lightDirection;
uniform float seed;
uniform float water;
uniform float ice;
uniform float cloud;
uniform float lava;
uniform float bands;
uniform float contrast;
uniform float warp;
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
    vec2 gasUv = globeUv(p);
    gasUv.x += seed + time * 0.0007;
    vec2 stormDelta = vec2(fract(gasUv.x - seed * 0.37 + 0.5) - 0.5, gasUv.y - (0.5 + stormLatitude * 0.28));
    vec2 ellipse = stormDelta / vec2(0.074, 0.037);
    float vortex = exp(-dot(ellipse,ellipse));
    float twist = vortex * 2.8 * stormStrength;
    mat2 turn = mat2(cos(twist), -sin(twist), sin(twist), cos(twist));
    gasUv += (turn * ellipse - ellipse) * vec2(0.074, 0.037);
    vec3 gas = field(flow, gasUv).rgb;
    float latitude = gasUv.y - 0.5;
    float phase = latitude * bands * 1.6 + .92*sin(latitude*18.+seed*4.) + warp*(1.8*gas.r+gas.b);
    float lanes = .5+.5*sin(phase);
    float fine = .5+.5*sin(phase*3.1+.65*sin(phase*1.8)+gas.b*2.4);
    float jet = .48+(lanes-.5)*(.25+.45*contrast)+.20*(fine-.5)+.23*(gas.r-.5);
    albedo = mix(lowColor, midColor, smoothstep(.10,.74,jet));
    albedo = mix(albedo, highColor, smoothstep(.36,.91,jet*.68+gas.g*.12+gas.b*.23));
    albedo = mix(albedo, stormColor, vortex * stormStrength * (0.3 + 0.65 * gas.g));
    albedo *= 0.69 + 0.38 * gas.b + 0.13 * gas.g;
    specular = 0.0;
    volcanic = vec3(0.0);
  }
  float scatter = pow(1.0 - mu, 3.8) * smoothstep(-0.35, 0.75, direct);
  vec3 color = albedo * (vec3(0.015, 0.023, 0.038) + sunlight * day * 1.55)
             + specular * 0.42 * day * sunlight + volcanic + airColor * air * scatter;
  gl_FragColor = vec4(color, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
