# Deployment security

Exora's Vercel deployment applies one global response policy in `vercel.json`. It is deliberately
compatible with the browser features the renderer actually uses rather than aiming for an empty
allowlist that would disable the experience.

## Browser policy decisions

- `Content-Security-Policy` defaults resources to the deployment origin. Variant Launch's early
  SDK is the only external script origin, and its byte-stable inline initialization listener is
  authorized by a SHA-256 hash instead of `unsafe-inline`.
- `wasm-unsafe-eval` permits WebAssembly compilation for Babylon's same-origin KTX2 transcoders.
  Babylon's vendored Emscripten glue also constructs named wrapper functions with `new Function`,
  so `unsafe-eval` is a required compatibility exception in `script-src`. No external origin can
  supply that code, and inline scripts still require the Variant hash. `blob:` is limited to
  workers and media/images so decoder workers and browser-generated resources keep working.
- Google Fonts is allowed only for stylesheets and fonts. Vercel Analytics and Speed Insights use
  same-origin `/_vercel` scripts and collection endpoints in production.
- Inline styles remain allowed because Babylon, the XR emulator, and React components set runtime
  element styles. This exception does not authorize inline scripts.
- `frame-ancestors 'none'` and `X-Frame-Options: DENY` both prevent framing. Variant's supported
  Launch Card flow is a top-level navigation, not an iframe, so it remains available.
- `Cross-Origin-Opener-Policy: same-origin` isolates unrelated popup contexts.
  `Cross-Origin-Resource-Policy: same-origin` prevents no-CORS embedding of Exora assets.
  `Cross-Origin-Embedder-Policy` is intentionally omitted: enabling it would require every
  third-party script/font to opt into CORS or CORP and is not required for WebXR or the KTX2 WASM
  decoders.
- `Permissions-Policy` keeps camera and spatial tracking available to Exora while disabling
  geolocation, microphone, payment, and USB. Camera and `xr-spatial-tracking` must remain allowed
  for immersive AR and VR capability checks.
- HSTS covers two years and deeper subdomains. The preload token is intentionally omitted because
  preloading is an owner-wide operational commitment that must be made at the registrable domain,
  not by this application. Referrers are reduced to the origin on cross-origin navigation.

## Browser-specific exceptions

`wasm-unsafe-eval` is supported by current Chromium, Firefox, and WebKit. The accompanying
`unsafe-eval` exception also keeps KTX2 working in older WebKit releases and is required by the
current upstream transcoder glue even in Chromium. Variant Launch itself requires a supported
iOS/App Clip environment, and its camera permission, domain authorization, and ARKit tracking
still require the physical-iPhone smoke test in `docs/iphone-ar.md`.

`worker-src` is the modern worker directive. Older browsers fall back through `child-src` and then
`script-src`; they are outside Exora's supported WebXR browser set if they cannot run the decoder
worker under this policy. Local Vite development is unchanged because these deployment headers are
applied by Vercel, not by the Vite development server.

## API boundaries

The public API exposes unauthenticated, read-only astronomy data, so CORS remains wildcard for
`GET` and `OPTIONS` without credentials or caller-selected request headers. Restricting browser
origins would not stop direct clients; rate limits and upstream caches are the relevant controls.

Only Vercel's ingress-owned `x-vercel-forwarded-for` value is accepted as a rate-limit identity,
and only when the runtime is deployed on Vercel. Generic `x-forwarded-for` and `x-real-ip` values
are ignored because an upstream proxy or direct caller can replace them. Local/direct requests
share the conservative `unknown` bucket.
