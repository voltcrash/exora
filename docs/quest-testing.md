# Meta Quest smoke test

Exora targets Meta Quest 2. Use a secure HTTPS URL in Meta Quest Browser; WebXR will not start
from a plain LAN HTTP address.

## Test pass

1. Open Exora and confirm the HUD reports `QUEST` beside the FPS counter.
2. Enter immersive VR and verify the viewing deck starts at floor height.
3. Orbit around one gas giant, one rocky world, and one ice giant.
4. Confirm the planet, atmosphere, and ice-giant rings render in both eyes, with no smearing of
   the previous frame at the edges of either eye.
5. Verify a controller ray can point at the in-headset panel and that every entry on it
   responds: change view, recentre, travel, and exit.
6. Walk the surface excursion with the thumbstick and confirm the wearer stays on the terrain.
7. Exit and re-enter VR, then switch worlds and enter again.
8. Travel from a world to its host star from inside the headset and confirm the session is
   handed over rather than dropping back to the flat page.
9. Leave the experience running for ten minutes to catch thermal throttling or memory growth.

Movement is thumbstick locomotion with smooth turning; teleportation is deliberately off, so a
controller ray only points and selects.

## Performance target

- Target the headset's 72 Hz refresh rate with no sustained drops below 60 FPS.
- Brief shader compilation drops during the first frame of a new world family are acceptable.
- The session raises fixed foveation on its own after three seconds below 62 FPS and relaxes it
  again above 70 FPS, so a brief soft periphery under load is expected rather than a fault.
- If frame rate remains below 60 FPS, reduce `fbmOctaves` in the Quest profile first, then
  `xrFramebufferScaleFactor`, then star count or sphere segments.

`deriveRenderQuality` separates Quest 2 from Quest 3 and Pro, and treats a headset it cannot
identify as the weaker one. Record the headset model, browser version, world name, average FPS,
lowest sustained FPS, and any visual or controller issues for each run.
