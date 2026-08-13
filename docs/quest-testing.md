# Meta Quest smoke test

Use a secure HTTPS URL in Meta Quest Browser; WebXR will not start from a plain LAN HTTP address.

## Test pass

1. Open Exora and confirm the HUD reports `QUEST` beside the FPS counter.
2. Enter immersive VR and verify the viewing deck starts at floor height.
3. Orbit around one gas giant, one rocky world, and one ice giant.
4. Confirm the planet, atmosphere, moon, and ice-giant rings render in both eyes.
5. Verify controller rays can point and teleport on the viewing deck.
6. Exit and re-enter VR, then switch worlds and enter again.
7. Leave the experience running for ten minutes to catch thermal throttling or memory growth.

## Performance target

- Target the headset's 72 Hz refresh rate with no sustained drops below 60 FPS.
- Brief shader compilation drops during the first frame of a new world family are acceptable.
- If frame rate remains below 60 FPS, first reduce `xrFramebufferScaleFactor` in the Quest profile, then star count or sphere segments.

Record the headset model, browser version, world name, average FPS, lowest sustained FPS, and any visual or controller issues for each run.
