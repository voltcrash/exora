uniform sampler2D detail;
uniform vec3 ramp[5], regolith, bedrock, frost, lava, skyTint, sunTint, sunDirection;
uniform float air, relief, strata, strataSpacing, datum, windStreaks;
uniform vec2 windDirection, detailOffset;
uniform bool neutral, cloudDeck;
varying vec3 groundPoint, groundNormal;
varying vec4 surfaceMask;
varying vec2 terrainShade;

vec3 elevationColor(float height) {
  float band = clamp(2.05 + height / relief * 1.52, 0., 3.999);
  if (band < 1.) return mix(ramp[0], ramp[1], band);
  if (band < 2.) return mix(ramp[1], ramp[2], band - 1.);
  if (band < 3.) return mix(ramp[2], ramp[3], band - 2.);
  return mix(ramp[3], ramp[4], band - 3.);
}

void main() {
  vec3 ray = groundPoint - cameraPosition;
  float distanceToEye = length(ray);
  vec3 N = normalize(groundNormal);
  float light = max(0., dot(N, sunDirection));
  vec3 clay = elevationColor(groundPoint.y);
  if (neutral) {
    gl_FragColor = vec4(clay * (0.67 + light * 0.5), 1.);
  } else {
    vec2 uv = groundPoint.xz;
    vec2 windUV = vec2(dot(uv, vec2(-windDirection.y, windDirection.x)), dot(uv, windDirection));
    vec3 broad = texture2D(detail, uv * .068 + detailOffset).rgb;
    vec3 grit = texture2D(detail, windUV * .32 + broad.gr * .14 + detailOffset).rgb;
    if (cloudDeck) {
      float wisps = texture2D(detail, windUV * vec2(.12, .022) + broad.rg * .14).b;
      float fringe = smoothstep(.22, .77, broad.g * .6 + wisps * .62);
      clay = mix(clay, ramp[4], fringe * .48);
      clay *= .66 + light * .68 + fringe * .29;
    } else {
      float loose = surfaceMask.x * smoothstep(.68, .97, N.y);
      float exposed = clamp(max(surfaceMask.y, (1. - N.y) * 1.9), 0., 1.);
      clay = mix(clay, regolith, loose * .65);
      clay = mix(clay, bedrock, exposed * (1. - loose * .38) * .79);

      float layers = sin((groundPoint.y + broad.g * .14 + groundPoint.x * .014) * 6.283 / strataSpacing);
      clay *= 1. + exposed * strata * (.17 * layers + .13 * sin(layers * 3. + 1.));
      clay *= .70 + broad.g * .72;
      clay = mix(clay, frost * (.54 + .8 * broad.b), surfaceMask.z * .86);

      float micro = mix(grit.g, mix(grit.g, grit.r, windStreaks), loose);
      micro = mix(micro, grit.b, surfaceMask.z);
      float detailFade = exp(-distanceToEye * .042);
      clay *= 1. + (micro - .37) * 1.3 * detailFade;
      vec3 reliefBump = vec3(dFdx(micro), 0., dFdy(micro));
      light = max(0., light + dot(reliefBump, vec3(-.55, 0., .32)) * detailFade);
      vec3 bounce = mix(vec3(.23, .24, .28), vec3(.33) + skyTint * .30, air) * terrainShade.x;
      clay *= bounce + sunTint * light * (2.14 * terrainShade.y);
      float heat = smoothstep(.06, .60, surfaceMask.w * (.7 + .82 * broad.g));
      clay = mix(clay, clay * .18, heat);
      clay += lava * heat * (.65 + .86 * broad.r);
      if (groundPoint.y < datum) clay *= .56;
    }
    float lowAir = exp(-max(0., groundPoint.y) * .045);
    float opticalDepth = distanceToEye * air * (.008 + .006 * lowAir);
    float haze = (1. - exp(-opticalDepth)) * .95;
    vec3 scatter = skyTint * (.47 + .14 * pow(max(0., dot(normalize(ray), sunDirection)), 4.));
    gl_FragColor = vec4(mix(clay, scatter, haze), 1.);
  }
  #include <colorspace_fragment>
}
