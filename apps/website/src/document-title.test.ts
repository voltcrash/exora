import { expect, test } from "vite-plus/test";
import {
  descriptionFor,
  documentTitleFor,
  SITE_DESCRIPTION,
  SITE_TITLE,
} from "./document-title.ts";

test("names the destination ahead of the site so tabs and history stay distinguishable", () => {
  expect(documentTitleFor("TRAPPIST-1 e")).toBe("TRAPPIST-1 e · Exora");
  expect(documentTitleFor("Sagittarius A*")).toBe("Sagittarius A* · Exora");
});

test("keeps the site title where there is no specific destination", () => {
  expect(documentTitleFor(null)).toBe(SITE_TITLE);
  expect(documentTitleFor("")).toBe(SITE_TITLE);
});

test("descriptions identify the destination and explain the simulated view", () => {
  expect(descriptionFor(null)).toBe(SITE_DESCRIPTION);
  expect(descriptionFor("TRAPPIST-1 e")).toContain("TRAPPIST-1 e");
  expect(descriptionFor("TRAPPIST-1 e")).toContain("simulated");
});
