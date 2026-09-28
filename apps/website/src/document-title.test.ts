import { expect, test } from "vite-plus/test";
import { documentTitleFor, SITE_TITLE } from "./document-title.ts";

test("names the destination ahead of the site so tabs and history stay distinguishable", () => {
  expect(documentTitleFor("TRAPPIST-1 e")).toBe("TRAPPIST-1 e · Exora");
  expect(documentTitleFor("Sagittarius A*")).toBe("Sagittarius A* · Exora");
});

test("keeps the site title where there is no specific destination", () => {
  expect(documentTitleFor(null)).toBe(SITE_TITLE);
  expect(documentTitleFor("")).toBe(SITE_TITLE);
});
