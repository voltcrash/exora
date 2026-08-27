import { expect, test } from "vite-plus/test";
import { budgetViolations } from "./performance-budget.ts";

test("budgets the final emitted files and the initial HTML path", () => {
  const emitted = [
    { bytes: 600_000, path: "assets/entry.js" },
    { bytes: 300_000, path: "assets/eager.js" },
    { bytes: 900_000, path: "assets/lazy.js" },
  ];

  expect(
    budgetViolations(emitted, new Set(["assets/entry.js", "assets/eager.js"]), {
      initialBytes: 850_000,
      largestFileBytes: 800_000,
    }),
  ).toEqual([
    "assets/lazy.js is 900,000 bytes; the emitted JavaScript file budget is 800,000 bytes.",
    "Initial JavaScript is 900,000 bytes; the emitted initial-path budget is 850,000 bytes.",
  ]);
});
