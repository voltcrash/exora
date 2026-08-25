# iPhone AR with Variant Launch

Exora uses standard Babylon.js WebXR `immersive-ar`; Variant Launch supplies that browser API
inside an iOS App Clip viewer. The renderer does not serialize or export GLB/USDZ files. Android
devices with native WebXR use the same AR session directly and do not need the iOS handoff.

## Production setup

1. Create a Variant Launch project and authorize every hostname that will serve AR, including the
   production hostname and any HTTPS preview hostname used for device testing.
2. Add the project's SDK key to the website build environment as
   `VITE_VARIANT_LAUNCH_KEY`. On Vercel this must be a build-time environment variable, because
   Vite injects the SDK script into the generated HTML.
3. Deploy over trusted HTTPS. An iPhone certificate warning or a self-signed LAN certificate is
   not sufficient for the App Clip flow.
4. Confirm the response keeps `camera=(self)` and `xr-spatial-tracking=(self)` in its
   `Permissions-Policy` header.

When no SDK key is configured, the Variant script is omitted entirely. Desktop, Quest, and native
Android WebXR continue to work, while Safari reports the same unavailable fallback as before.

The SDK is loaded without `redirect=true`: opening Exora on an iPhone never redirects on its own.
The existing immersive button reads **OPEN AR ON IPHONE** when Variant reports that a handoff is
required, and the tap opens Variant's recommended Launch Card URL. In the Launch viewer the same
button reads **PLACE IN YOUR SPACE** and starts the standard WebXR session.

## Real-device smoke test

Variant's App Clip, camera permission, ARKit tracking, and domain authorization cannot be proven
by desktop emulation. Run this pass on a physical iPhone in a non-private Safari window:

1. Open the deployed Exora URL and verify the immersive button reads **OPEN AR ON IPHONE**.
2. Tap it, open the Variant Launch App Clip from the Launch Card, and confirm Exora reloads in the
   viewer with the button reading **PLACE IN YOUR SPACE**.
3. Start AR and allow camera access. The physical camera feed must fill the background; Exora's
   starfield and a planet surface's atmospheric sky dome must not cover it.
4. Move the phone slowly over a textured floor or table until the cyan reticle appears.
5. Tap once. The current planet, star, black hole, system, or other mounted scene should appear at
   a tabletop scale with its existing materials, animation, and shaders intact.
6. Drag the placed object to reposition it across the detected horizontal surface. Pinch with two
   fingers to scale it; verify scaling remains uniform and bounded.
7. Exit AR. The flat desktop/mobile view must return at its original camera framing, with its
   virtual sky restored.
8. Repeat with one planet, one star, and one black hole. Then re-run the existing Meta Quest
   checklist to confirm the same control still enters `immersive-vr`, retains thumbstick
   locomotion, and opens the in-headset Discover screen.

If Safari never offers AR, check the Variant SDK key, authorized hostname, HTTPS certificate,
Safari/private-browsing state, and whether a content blocker prevented `launchar.app` from
loading. If the Launch viewer opens but the camera or WebXR capability is absent, capture the iOS
version and Safari Web Inspector output before contacting Variant support.
