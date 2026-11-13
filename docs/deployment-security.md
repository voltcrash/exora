# Deployment security

Exora's deployment applies one global response policy from `apps/website/public/_headers`. It is deliberately
compatible with the browser features the renderer actually uses rather than aiming for an empty
allowlist that would disable the experience.

## Deployment workflow

Production is one Cloudflare Worker with static assets, described by the committed
`wrangler.jsonc`. The Deploy workflow publishes `main` once the `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID` repository secrets exist. Static files carry the headers and cache rules
in `apps/website/public/_headers`; the API sets its own `X-Robots-Tag` and
`X-Content-Type-Options`, because header files never apply to responses a Worker produces.

Local development uses `vp run dev` and needs no Cloudflare tooling. `vp run deploy:check` bundles
the Worker and reads the asset directory without publishing, as the Quality workflow does on every
pull request. For a manual deployment, run `vp run deploy`, which builds and then runs the latest
wrangler through `pnpm dlx`. Do not add wrangler to the workspace dependencies.

The same `_headers` and `_redirects` files are read by Cloudflare Pages and Netlify, and by the Node
server when `STATIC_ROOT` points at `apps/website/dist`, so the policy below holds on any of them.

## Browser policy decisions

- `Content-Security-Policy` defaults resources to the deployment origin. Variant Launch's early
  SDK is the only external script origin, and its byte-stable inline initialization listener is
  authorized by a SHA-256 hash instead of `unsafe-inline`.
- `wasm-unsafe-eval` permits WebAssembly compilation for Babylon's same-origin KTX2 transcoders.
  Babylon's vendored Emscripten glue also constructs named wrapper functions with `new Function`,
  so `unsafe-eval` is a required compatibility exception in `script-src`. No external origin can
  supply that code, and inline scripts still require the Variant hash. `blob:` is limited to
  workers and media/images so decoder workers and browser-generated resources keep working.
- Fonts are bundled and served from the deployment origin. No analytics or monitoring script is
  loaded, so no third-party collection endpoint is allowed.
- Inline styles remain allowed because Babylon and React components set runtime
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
  for immersive AR capability checks.
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
applied by the host, not by the Vite development server.

## API boundaries

The public API exposes unauthenticated, read-only astronomy data, so CORS remains wildcard for
`GET` and `OPTIONS` without credentials or caller-selected request headers. Restricting browser
origins would not stop direct clients; rate limits and upstream caches are the relevant controls.

Only the one header the hosting edge overwrites is accepted as a rate-limit identity:
`cf-connecting-ip` on Cloudflare, or the header named by `TRUSTED_CLIENT_IP_HEADER` for the Node
server behind a reverse proxy. Generic `x-forwarded-for` and `x-real-ip` values are otherwise
ignored because an upstream proxy or direct caller can replace them. Local/direct requests share
the conservative `unknown` bucket.
