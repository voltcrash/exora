import { expect, test } from "vite-plus/test";
import { hostStarJumpError, settleHostStarJump } from "./host-star-jump.ts";

test("a jump that lands or is superseded leaves no error behind", async () => {
  const jump = await settleHostStarJump(Promise.resolve(true));

  expect(jump).toBe("idle");
  expect(hostStarJumpError(jump, "GJ 674")).toBeNull();
});

test("a star SIMBAD does not know is reported by name", async () => {
  const jump = await settleHostStarJump(Promise.resolve(false));

  expect(jump).toBe("missing");
  expect(hostStarJumpError(jump, "GJ 674")).toBe("SIMBAD could not find a star called GJ 674.");
});

test("an unreachable archive is not mistaken for an unknown star", async () => {
  const jump = await settleHostStarJump(
    Promise.reject(new Error("Destination lookup failed with status 502.")),
  );

  expect(jump).toBe("unavailable");
  expect(hostStarJumpError(jump, "GJ 674")).not.toContain("could not find");
  expect(hostStarJumpError(jump, "GJ 674")).toContain("could not be reached");
});
