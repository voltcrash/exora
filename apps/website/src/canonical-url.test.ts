import { expect, test } from "vite-plus/test";
import { canonicalUrlForSearch, SITE_ORIGIN } from "./canonical-url.ts";

test("the landing page is canonical to itself", () => {
  expect(canonicalUrlForSearch("")).toBe(`${SITE_ORIGIN}/`);
  expect(canonicalUrlForSearch("?")).toBe(`${SITE_ORIGIN}/`);
});

test("a catalogued destination is canonical to its own URL", () => {
  // The point of the change: this used to resolve to the root, which told a crawler the world
  // was a duplicate of the landing page.
  expect(canonicalUrlForSearch("?planet=Kepler-22%20b")).toBe(
    `${SITE_ORIGIN}/?planet=Kepler-22%20b`,
  );
  expect(canonicalUrlForSearch("?star=Sirius")).toBe(`${SITE_ORIGIN}/?star=Sirius`);
  expect(canonicalUrlForSearch("?system=TRAPPIST-1")).toBe(`${SITE_ORIGIN}/?system=TRAPPIST-1`);
  expect(canonicalUrlForSearch("?asteroid=101955%20Bennu")).toBe(
    `${SITE_ORIGIN}/?asteroid=101955%20Bennu`,
  );
  expect(canonicalUrlForSearch("?comet=67P%2FChuryumov%E2%80%93Gerasimenko")).toBe(
    `${SITE_ORIGIN}/?comet=67P%2FChuryumov%E2%80%93Gerasimenko`,
  );
  expect(canonicalUrlForSearch("?region=Oort%20Cloud")).toBe(`${SITE_ORIGIN}/?region=Oort%20Cloud`);
});

test("names with characters that need escaping survive the round trip", () => {
  expect(canonicalUrlForSearch("?planet=55%20Cnc%20e")).toBe(`${SITE_ORIGIN}/?planet=55%20Cnc%20e`);
  expect(canonicalUrlForSearch("?star=Barnard's%20star")).toBe(
    `${SITE_ORIGIN}/?star=Barnard's%20star`,
  );
});

test("a procedural world collapses to the root rather than inviting a crawler to index a seed", () => {
  expect(canonicalUrlForSearch("?custom=My%20World")).toBe(`${SITE_ORIGIN}/`);
  expect(canonicalUrlForSearch("?customStar=My%20Star")).toBe(`${SITE_ORIGIN}/`);
});

test("tracking parameters cannot mint a distinct canonical for the same page", () => {
  expect(canonicalUrlForSearch("?utm_source=newsletter&fbclid=abc")).toBe(`${SITE_ORIGIN}/`);
  // A destination keeps its identity, and the extra parameters are dropped from it.
  expect(canonicalUrlForSearch("?planet=Kepler-22%20b&utm_source=newsletter")).toBe(
    `${SITE_ORIGIN}/?planet=Kepler-22%20b`,
  );
});

test("the destinations resolve in the order the app resolves them", () => {
  // `loadRequestedObject` checks star, then system, then planet, so the canonical has to agree.
  expect(canonicalUrlForSearch("?planet=Kepler-22%20b&star=Sirius")).toBe(
    `${SITE_ORIGIN}/?star=Sirius`,
  );
  expect(canonicalUrlForSearch("?planet=Kepler-22%20b&system=Kepler-22")).toBe(
    `${SITE_ORIGIN}/?system=Kepler-22`,
  );
  expect(canonicalUrlForSearch("?star=Sirius&system=Kepler-22")).toBe(
    `${SITE_ORIGIN}/?star=Sirius`,
  );
  expect(canonicalUrlForSearch("?planet=Earth&region=Kuiper%20Belt")).toBe(
    `${SITE_ORIGIN}/?region=Kuiper%20Belt`,
  );
});

test("an empty or blank destination is not treated as one", () => {
  expect(canonicalUrlForSearch("?planet=")).toBe(`${SITE_ORIGIN}/`);
  expect(canonicalUrlForSearch("?star=%20%20")).toBe(`${SITE_ORIGIN}/`);
  expect(canonicalUrlForSearch("?system=")).toBe(`${SITE_ORIGIN}/`);
});
