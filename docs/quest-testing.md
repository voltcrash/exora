# Meta Quest smoke test

Exora targets Meta Quest 2. Use a secure HTTPS URL in Meta Quest Browser; WebXR will not start
from a plain LAN HTTP address.

## Test pass

1. Open Exora and confirm the HUD reports `QUEST` beside the FPS counter.
2. Enter immersive VR with the controller trigger and verify the viewing deck starts at floor
   height without immediately returning to the flat page. Release the trigger before testing its
   exit shortcut.
3. Orbit around one gas giant, one rocky world, and one ice giant.
4. Confirm the planet, atmosphere, and ice-giant rings render in both eyes, with no smearing of
   the previous frame at the edges of either eye.
5. Verify VR opens directly onto the full world and never creates a Discover panel, DOM capture,
   or other browser UI in the immersive scene. In orbit, point at the planet and press A/X once;
   confirm it enters the terrain view. Holding A/X or moving the controller must do nothing else.
6. Walk the surface excursion with the thumbstick and confirm the wearer stays on the terrain.
7. Press either trigger to exit VR. If the runtime continues exposing the controller on the flat
   page, press either trigger again to re-enter; otherwise use the page's immersive control, as
   WebXR does not expose disconnected XR controllers to page input. Switch worlds and enter again.
8. While VR is active, press either grip and confirm the browser/desktop Discover dialog toggles
   on the mirrored page without adding anything to the headset scene. Repeat with the left
   application-menu button. Each press must open or close the same React dialog immediately.
9. Open a system diorama on a host with several worlds — TRAPPIST-1, Kepler-90 and our own Sun
   are the three worth checking, being the most compact, the most spread out, and the one with
   the most worlds. A session opens on a deck above the plane, so confirm the orbits read as
   rings rather than a flat line.
10. From inside the diorama, point at a world and travel to it, then return from the browser page.
    Do the same between a world and its host star.
11. Travel from a world to its host star from inside the headset, then on to a world in that
    star's system. The session must never end: the view fades to black, the new object fades in
    around the wearer, and the headset is never returned to the flat page or the VR entry prompt
    in between.
12. Enter VR from a Solar System region and a black hole, and confirm each one offers the
    immersive entry on the page.
13. Leave the experience running for ten minutes to catch thermal throttling or memory growth.

Movement is thumbstick locomotion with smooth turning; teleportation and Babylon's default
trigger/grip pointer selection are deliberately off. A/X only enters terrain when aimed at a planet.

## Performance target

- Target the headset's 72 Hz refresh rate with no sustained drops below 60 FPS.
- Toggling browser Discover from a grip or the left application-menu button must not affect the
  headset frame rate; there is no DOM capture or in-headset UI texture.
- Brief shader compilation drops during the first frame of a new world family are acceptable.
- The session raises fixed foveation on its own after three seconds below 62 FPS and relaxes it
  again above 70 FPS, so a brief soft periphery under load is expected rather than a fault.
- If frame rate remains below 60 FPS, reduce `fbmOctaves` in the Quest profile first, then
  `xrFramebufferScaleFactor`, then star count or sphere segments.
- The diorama is the one scene whose cost scales with the destination rather than the tier, so
  check the widest system you can find. Its geometry is bounded against a single arrived-at world
  by a test, but its fill cost is not: `systemBodySegments` and `systemOrbitSegments` are the two
  knobs, and the host star's corona shell is the largest single item in the frame.

`deriveRenderQuality` separates Quest 2 from Quest 3 and Pro, and treats a headset it cannot
identify as the weaker one. Record the headset model, browser version, world name, average FPS,
lowest sustained FPS, and any visual or controller issues for each run.
