#include <common>
#include <packing>
#include <lights_pars_begin>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>

uniform sampler2D detail, cliffScan;
uniform vec3 ramp[5], regolith, bedrock, frost, lava, skyTint, sunTint, sunDirection;
uniform float air, relief, strata, strataSpacing, datum, windStreaks, lavaGlow, time;
uniform vec2 detailOffset;
uniform bool neutral, cloudDeck, hasScans;
varying vec3 groundPoint, groundNormal;
varying vec4 surfaceMask;
varying vec2 terrainShade;

float valueNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  vec4 h = fract(sin(dot(i,vec2(27.1, 51.7)) + vec4(0., 27.1, 51.7, 78.8)) * 4375.13);
  return mix(mix(h.x,h.y,f.x),mix(h.z,h.w,f.x),f.y);
}

void main() {
  vec3 P = groundPoint, N = normalize(groundNormal);
  vec3 V = normalize(cameraPosition - P);
  float distanceToEye = length(cameraPosition - P);
  vec3 color;
  if (neutral) {
    color = ramp[2] * (.52 + .72 * max(dot(N, sunDirection), 0.));
  } else if (cloudDeck) {
    vec2 uv = P.xz * .017 + detailOffset;
    vec2 curl = vec2(valueNoise(uv), valueNoise(uv * 1.6 + 4.));
    float mist = .64 * valueNoise(uv * 5. + curl * 3.) + .36 * valueNoise(uv * 14. + curl * 6.);
    float bank = clamp(.37 + P.y * .014 + mist * .38, 0., 1.);
    color = mix(ramp[1], ramp[4], bank);
    color *= .51 + .57 * max(dot(N,sunDirection),0.) + .29 * mist;
    color = mix(color, ramp[3], .24 + .59 * (1. - exp(-distanceToEye * .025)));
  } else {
    vec2 field = P.xz * .062 + detailOffset * 8.;
    float deposit = .57 * valueNoise(field) + .29 * valueNoise(field * 2.87) + .14 * valueNoise(field * 8.1);
    vec3 weights = pow(abs(N), vec3(4.));
    weights /= max(.001, weights.x + weights.y + weights.z);
    vec3 axis = sign(N);
    float exposure = clamp(surfaceMask.y * .48 + (1. - abs(N.y)) * 1.43, 0., 1.);
    float crust = clamp(surfaceMask.x * (.67 + .36 * deposit), 0., 1.);
    float ice = surfaceMask.z;
    vec3 microNormal = N;
    float albedo = 1.;
    if (hasScans) {
      vec2 tile = P.xz * .32 + detailOffset;
      vec3 ground = texture2D(detail, tile).rgb;
      vec3 rockX = texture2D(cliffScan, vec2(-axis.x * P.z, P.y) * .22 + detailOffset).rgb;
      vec3 rockZ = texture2D(cliffScan, vec2(axis.z * P.x, P.y) * .22 - detailOffset).rgb;
      vec3 top = texture2D(cliffScan, tile * .57 + .37).rgb;
      ground = mix(ground, top, exposure * (1. - ice * .8));
      vec3 rock = rockX * weights.x + ground * weights.y + rockZ * weights.z;
      vec2 nx = rockX.rg * 2. - 1., ny = ground.rg * 2. - 1., nz = rockZ.rg * 2. - 1.;
      vec3 slopes = vec3(0., nx.y, -axis.x * nx.x) * weights.x
                  + vec3(ny.x, 0., ny.y) * weights.y
                  + vec3(axis.z * nz.x, nz.y, 0.) * weights.z;
      microNormal = normalize(N + (slopes - N * dot(slopes, N)) * .93);
      albedo = pow(max(.045, rock.b * 2.), 1.8);
    }
    float layer = P.y * .49 / max(.45,strataSpacing) + P.x * .023 + .92 * valueNoise(field * .68);
    float mineral = valueNoise(vec2(layer * 2.4, 1.7)) + .38 * valueNoise(vec2(layer * 9.7, 5.));
    vec3 stone = mix(bedrock * .56, ramp[3], (.17 + .34 * smoothstep(.24,.99, mineral)) * strata);
    vec3 fines = mix(ramp[1], regolith, .38 + .62 * deposit);
    color = mix(stone, fines, crust * (1. - exposure * .91));
    color *= (.69 + .55 * deposit) * albedo;
    float snow = ice * smoothstep(.34,.91, N.y + .24 * (deposit - .5));
    color = mix(color, mix(vec3(.075,.22,.31), frost * .68, snow) * mix(albedo, 1., .52), ice);
    if (lavaGlow > .05) {
      vec3 cooled = mix(vec3(.024,.018,.021), bedrock * .63, deposit) * albedo;
      color = mix(cooled, color, smoothstep(.20,.60, crust + .25 * (deposit-.5)));
    }
    float direct = max(dot(microNormal, sunDirection), 0.);
    vec3 ambient = mix(vec3(.14,.157,.20), vec3(.27,.26,.29) + skyTint * .18, air);
    float shadow = min(terrainShade.y, getShadowMask());
    color *= ambient * (.42 + .71 * terrainShade.x) + sunTint * (1.46 * direct * shadow);
    color += ice * (.024 + .12 * pow(max(0., dot(microNormal,normalize(sunDirection + V))), 28.)) * shadow;
    float flow = surfaceMask.w;
    if (flow > .001) {
      float fracture = valueNoise(P.xz * 2.7 + .23 * sin(time * .22)) * .22 + deposit * .22;
      float hot = smoothstep(.05,.56, flow * (1.08 - fracture));
      vec2 cooledPlate = P.xz * vec2(.74, 1.18) + deposit * .9;
      float plate = valueNoise(cooledPlate) * .71 + .29 * valueNoise(cooledPlate * 4. + time * .014);
      float skin = smoothstep(.43, .61, plate);
      vec3 melt = mix(vec3(.61,.025,.002), vec3(2.4,.73,.06), hot * (1. - skin));
      color = mix(color, mix(melt, vec3(.049,.018,.014) * albedo, skin * .95), hot);
    }
    if (P.y < datum) color *= .58;
    float fog = 1. - exp(-distanceToEye * air * .0125);
    color = mix(color, skyTint * .62 + sunTint * air * .075, fog * .94);
  }
  gl_FragColor = vec4(color / (1. + .34 * color), 1.);
  #include <colorspace_fragment>
}
