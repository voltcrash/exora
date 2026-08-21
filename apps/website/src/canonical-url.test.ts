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

test("a star wins when both are somehow present, matching what the app renders", () => {
  // `loadRequestedObject` checks `star` first, so the canonical has to agree with it.
  expect(canonicalUrlForSearch("?planet=Kepler-22%20b&star=Sirius")).toBe(
    `${SITE_ORIGIN}/?star=Sirius`,
  );
});

test("an empty or blank destination is not treated as one", () => {
  expect(canonicalUrlForSearch("?planet=")).toBe(`${SITE_ORIGIN}/`);
  expect(canonicalUrlForSearch("?star=%20%20")).toBe(`${SITE_ORIGIN}/`);
});
