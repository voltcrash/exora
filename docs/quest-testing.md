# Meta Quest smoke test

Exora targets Meta Quest 2. Use a secure HTTPS URL in Meta Quest Browser; WebXR will not start
from a plain LAN HTTP address.

## Test pass

1. Open Exora and confirm the HUD reports `QUEST` beside the FPS counter.
2. Enter immersive VR and verify the viewing deck starts at floor height.
3. Orbit around one gas giant, one rocky world, and one ice giant.
4. Confirm the planet, atmosphere, and ice-giant rings render in both eyes, with no smearing of
   the previous frame at the edges of either eye.
5. Verify VR opens directly onto the full world, then summon Discover with a controller menu
   button. Confirm a controller ray can point at the in-headset panel and that every entry on it
   responds: browse, travel, recentre, and return to the world. In the world, hold A/X while
   moving a controller to drag the pointed object; release without moving to select it.
6. Walk the surface excursion with the thumbstick and confirm the wearer stays on the terrain.
7. Exit and re-enter VR, then switch worlds and enter again.
8. Open a system diorama on a host with several worlds — TRAPPIST-1, Kepler-90 and our own Sun
   are the three worth checking, being the most compact, the most spread out, and the one with
   the most worlds. A session opens on a deck above the plane, so confirm the orbits read as
   rings rather than a flat line. Then take "Stand in the plane" from the panel and confirm the
   wearer drops to the orbits themselves and can walk between them with the thumbstick.
9. From inside the diorama, point at a world and travel to it, then use "View the whole system" on
   the panel to come back. Do the same between a world and its host star.
10. Travel from a world to its host star from inside the headset, then on to a world in that
    star's system. The session must never end: the view fades to black, the new object fades in
    around the wearer, and the headset is never returned to the flat page or the VR entry prompt
    in between. The panel stays open on the page it was on, now describing the new object.
11. Enter VR from each of the Solar System's own destinations — an asteroid, a comet, a region,
    a mission and a black hole — and confirm each one offers the immersive entry on the page, and
    that from inside it the panel's Worlds, Stars and Forge pages travel and generate rather than
    browsing to a dead end. On a mission, confirm the panel's own switch draws the flown path,
    and that the page agrees with it after the headset comes off.
12. Leave the experience running for ten minutes to catch thermal throttling or memory growth.

## Known gaps

These work on the page and have no in-headset equivalent yet. They are omissions rather than
faults, but a smoke test should not report them as new:

- A star or diorama lists the first five of its worlds on the panel and does not page past them,
  so a host with more — our own Sun has thirteen — cannot reach the rest without leaving VR.
- A planet's moon subsystem is a page control only, so Jupiter's moons cannot be opened, or left,
  from inside a session.
- The Solar System diorama's live ephemeris clock and a comet's heliocentric-distance slider are
  page controls with no console entries.

Movement is thumbstick locomotion with smooth turning; teleportation is deliberately off, so a
controller ray only points and selects.

## Performance target

- Target the headset's 72 Hz refresh rate with no sustained drops below 60 FPS.
- Opening Discover may cause one brief frame-time spike while its DOM is captured, but leaving the
  panel still must hold 60 FPS and must not trigger continuous recaptures while it is idle.
- Moving either controller ray across Discover must not change frame rate or produce hover
  vibration. Haptics are reserved for a deliberate selection.
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
