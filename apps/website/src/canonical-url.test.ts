import { expect, test } from "vite-plus/test";
import { canonicalUrlForSearch, SITE_ORIGIN } from "./canonical-url.ts";

test("creates canonicals only for resolved catalog destinations", () => {
  const cases: [string, string][] = [
    ["", "/"],
    ["?", "/"],
    ["?planet=Kepler-22%20b", "/?planet=Kepler-22%20b"],
    ["?blackHole=Sagittarius%20A*", "/?blackHole=Sagittarius%20A*"],
    ["?star=Sirius", "/?star=Sirius"],
    ["?system=TRAPPIST-1", "/?system=TRAPPIST-1"],
    ["?region=Oort%20Cloud", "/?region=Oort%20Cloud"],
    ["?planet=55%20Cnc%20e", "/?planet=55%20Cnc%20e"],
    ["?star=Barnard's%20star", "/?star=Barnard's%20star"],
    ["?planet=Earth&blackHole=M87*", "/?blackHole=M87*"],
    ["?planet=Kepler-22%20b&star=Sirius", "/?star=Sirius"],
    ["?planet=Kepler-22%20b&system=Kepler-22", "/?system=Kepler-22"],
    ["?star=Sirius&system=Kepler-22", "/?star=Sirius"],
    ["?planet=Earth&region=Kuiper%20Belt", "/?region=Kuiper%20Belt"],
    ["?planet=Kepler-22%20b&utm_source=newsletter", "/?planet=Kepler-22%20b"],
  ];

  for (const [search, path] of cases) {
    expect(canonicalUrlForSearch(search), search || "root").toBe(`${SITE_ORIGIN}${path}`);
  }
});

test("collapses generated, tracking, and blank destinations to the root", () => {
  for (const search of [
    "?custom=My%20World",
    "?customStar=My%20Star",
    "?utm_source=newsletter&fbclid=abc",
    "?planet=",
    "?blackHole=%20%20",
    "?star=%20%20",
    "?system=",
  ]) {
    expect(canonicalUrlForSearch(search), search).toBe(`${SITE_ORIGIN}/`);
  }
});
