/** Where a jump to a world's host star stands, including why the last one did not land. */
export type HostStarJump = "idle" | "loading" | "missing" | "unavailable";

/**
 * Reads a host-star selection, which resolves false when SIMBAD has no such star and rejects when
 * SIMBAD could not be asked at all.
 */
export const settleHostStarJump = (selection: Promise<boolean>): Promise<HostStarJump> =>
  selection.then(
    (found) => (found ? "idle" : "missing"),
    () => "unavailable",
  );

export const hostStarJumpError = (jump: HostStarJump, hostStar: string): string | null => {
  if (jump === "missing") return `SIMBAD could not find a star called ${hostStar}.`;
  if (jump === "unavailable") return "SIMBAD could not be reached. Try again in a moment.";
  return null;
};
