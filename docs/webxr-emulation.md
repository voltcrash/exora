# Desktop WebXR emulation

A regular browser reports no `immersive-vr` device, so the immersive flow normally only runs
on a headset. For debugging, Exora can install the [Immersive Web Emulation Runtime][iwer]
(IWER) over `navigator.xr`: a synthetic Meta Quest 3 device plus an on-screen rig for the
headset and both controllers. The application code is untouched — the same
`WebXRDefaultExperience` path, movement feature, and pointer selection run in the tab.

## Enabling it

Start the dev server and append `?xr=emulate`:

```bash
vp run dev
```

Then open <http://localhost:5173/?xr=emulate>.

| Query         | Effect                                                     |
| ------------- | ---------------------------------------------------------- |
| `?xr=emulate` | Install the emulated runtime as a Quest 2 (also `on`, `1`) |
| `?xr=quest3`  | Install it as a Quest 3 instead                            |
| `?xr=stereo`  | Install it and render both eyes side by side               |
| `?xr=off`     | Return to the browser's native runtime                     |

The default is a Quest 2 because that is the headset Exora targets and `deriveRenderQuality`
reads the model out of the user agent: emulating the newer headset would quietly exercise the
wrong rendering budget in the one place the budget is the point.

The choice is remembered in `sessionStorage`, so in-app navigation keeps emulating until you
pass `?xr=off` or open a new tab.

## Using the session

Press **ENTER IMMERSIVE VR** in the footer. Session status reads `IMMERSIVE VR ACTIVE ·
EMULATED` whenever the runtime is emulated, so an emulated run is never mistaken for headset
telemetry. The IWER panels then drive the device:

- the toolbar resets the pose, locks the pointer for mouse-look, toggles controllers versus
  hands, and exits the session;
- each controller panel sets position, rotation, thumbstick, trigger, grip, and face buttons.

IWER also reports a Quest user agent, so `deriveRenderQuality` selects the `quest` tier and
the HUD reads `FPS · QUEST`. That makes the headset rendering budget testable on a desktop,
but the frame rate is the desktop GPU's — never quote it as a Quest measurement. Use the
[Meta Quest smoke-test checklist](quest-testing.md) for real performance validation.

## What the emulator gets wrong

IWER declares `XRReferenceSpace.getOffsetReferenceSpace` as taking a raw `mat4`, where the
specification passes an `XRRigidTransform`. Handed a conforming transform it clones sixteen
`undefined`s and produces an all-NaN offset, which silently discards the move.

Moving the wearer is done by writing the XR camera's position, and Babylon turns exactly that
write into an offset reference space — so unpatched, every scene's `focusXrRig` is a no-op under
emulation and the wearer stands at the tracking origin in every destination, whatever the scene
asked for. `installXrEmulator` therefore repairs the method before the DevUI is installed. If a
future IWER release adopts the spec signature, the shim becomes a harmless pass-through and can
be dropped.

## Builds

Emulation is compiled out of production builds. It is available on the dev server, and in a
build made with `VITE_XR_EMULATOR=1` when a deployed preview needs the same treatment.

[iwer]: https://github.com/meta-quest/immersive-web-emulation-runtime
