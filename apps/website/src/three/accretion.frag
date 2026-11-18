uniform sampler2D diskMap;
uniform vec3 diskTint;
uniform vec3 jetTint;
uniform float jet;
uniform float activity;
uniform float elapsed;
uniform float seed;
uniform float companion;
varying vec3 entry;
varying vec3 eye;

const float bound = 12.0;
const vec3 binaryPosition = vec3(-8.4, 2.8, -1.5);

vec3 gravity(vec3 p, float h2) {
  float r2 = dot(p,p);
  return -1.5 * h2 * p / (r2*r2*sqrt(r2));
}
vec4 disk(vec3 p, vec3 direction) {
  float r = length(p.xz);
  float zone = smoothstep(3.,3.55,r) * (1. - smoothstep(8.,10.,r));
  float phi = atan(p.z,p.x) / 6.2831853 + .5;
  float u = phi + seed - elapsed * .17 / pow(r,1.5);
  vec3 gas = textureLod(diskMap,vec2(u,clamp((r-3.)/7.,0.,1.)),0.).rgb;
  float temperature = min(1., pow(3./r,.75));
  float velocity = dot(normalize(vec3(-p.z,0.,p.x)), -direction) / sqrt(max(2.*(r-1.),1.));
  float boost = sqrt(max(0.,1.-1./r)) / (1.-velocity);
  vec3 fire = mix(diskTint*.62,vec3(1.,.9,.72),temperature*temperature*.84);
  float light = pow(boost,3.) * (.4+1.6*gas.r) * (.48+.7*gas.g) * (.85+.3*gas.b);
  return vec4(fire * light * (.48+activity*1.6), zone*(.5+.38*gas.r));
}
void main() {
  vec3 v=normalize(entry-eye);
  float alignment=dot(eye,v);
  float discriminant=alignment*alignment-dot(eye,eye)+bound*bound;
  if(discriminant<0.) discard;
  vec3 p=eye+v*max(0.,-alignment-sqrt(discriminant)+.002);
  float h2=dot(cross(p,v),cross(p,v));
  vec3 energy=vec3(0.);
  float transmission=1.;
  for(int i=0;i<RAY_STEPS;i++){
    float r=length(p);
    if(r<1.03){transmission=0.;break;}
    if(r>bound+.01 && dot(v,p)>0.)break;
    float stepLength=clamp(r*.095,.065,1.05);
    vec3 a=gravity(p,h2);
    vec3 next=p+stepLength*(v+.5*stepLength*a);
    vec3 dv=.5*stepLength*(a+gravity(next,h2));
    if(p.y*next.y<=0. && abs(next.y-p.y)>.000001){
      vec3 hit=mix(p,next,clamp(-p.y/(next.y-p.y),0.,1.));
      if(length(hit.xz)>=3. && length(hit.xz)<10.){
        vec4 emission=disk(hit,normalize(v));
        energy+=transmission*emission.rgb*emission.a;
        transmission*=1.-emission.a;
      }
    }
    vec3 middle=.5*(p+next);
    float height=abs(middle.y);
    float width=.1+.07*height;
    float column=exp(-dot(middle.xz,middle.xz)/(width*width));
    energy+=transmission*jetTint*jet*column*smoothstep(1.75,3.,height)*(1.-smoothstep(7.,11.2,height))*stepLength;
    if(companion>0.){
      float t=clamp(dot(binaryPosition-p,next-p)/max(dot(next-p,next-p),.000001),0.,1.);
      float gap=distance(mix(p,next,t),binaryPosition);
      if(gap<companion){
        energy+=transmission*vec3(.61,.77,1.)*(.8+.25*(1.-gap/companion));
        transmission=0.;break;
      }
    }
    p=next;v+=dv;
  }
  float opacity=clamp(1.-transmission+max(max(energy.r,energy.g),energy.b)*.21,0.,1.);
  if(opacity<.001)discard;
  gl_FragColor=vec4(energy/max(opacity,.001),opacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
