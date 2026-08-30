import { expect, test } from "vite-plus/test";
import { appendUniqueById } from "./catalog-pagination.ts";

test("appends only destinations the catalog has not listed yet", () => {
  const current = [{ id: "altair" }, { id: "vega" }];
  const result = appendUniqueById(current, [{ id: "vega" }, { id: "rigel" }, { id: "rigel" }]);

  expect(result.map((item) => item.id)).toEqual(["altair", "vega", "rigel"]);
});

test("keeps the existing page when a follow-up page repeats it", () => {
  const current = [{ id: "altair" }];

  expect(appendUniqueById(current, [{ id: "altair" }])).toEqual(current);
});
