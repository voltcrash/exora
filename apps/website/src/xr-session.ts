/**
 * Immersive session handover between scenes.
 *
 * Travelling from a world to its host star (or back) tears down one Babylon engine and builds
 * another, which necessarily ends the running WebXR session. Without a handover the wearer is
 * dumped back into a flat page and has to take the headset off. Recording the intent lets the
 * next scene re-enter immersive mode as soon as it is ready, and the short expiry keeps a stale
 * request from yanking somebody into VR minutes later.
 */

const HANDOFF_LIFETIME_MS = 30_000;

let requestedAt = 0;

/** Records that the visitor was in immersive VR when they asked to travel elsewhere. */
export const requestVrHandoff = (): void => {
  requestedAt = Date.now();
};

/** Returns true once if a fresh handover is pending, clearing it in the process. */
export const consumeVrHandoff = (): boolean => {
  const pending = requestedAt > 0 && Date.now() - requestedAt < HANDOFF_LIFETIME_MS;
  requestedAt = 0;
  return pending;
};

/** Drops any pending handover, used when a scene fails to enter immersive mode. */
export const clearVrHandoff = (): void => {
  requestedAt = 0;
};
