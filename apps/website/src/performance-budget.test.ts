import { expect, test } from "vite-plus/test";
import type { Manifest } from "vite-plus";
import { budgetViolations, initialJavaScriptPaths } from "./performance-budget.ts";

test("startup budgets include the dynamic app and shared static imports, excluding lazy features", () => {
  const manifest: Manifest = {
    "index.html": {
      file: "assets/startup.js",
      dynamicImports: ["src/main.tsx"],
    },
    "src/main.tsx": {
      file: "assets/main.js",
      imports: ["shared", "react"],
      dynamicImports: ["scene"],
    },
    shared: { file: "assets/shared.js", imports: ["index.html", "react"] },
    react: { file: "assets/react.js" },
    scene: { file: "assets/scene.js" },
  };
  const paths = initialJavaScriptPaths(manifest, ["index.html", "src/main.tsx"]);
  expect([...paths]).toEqual([
    "assets/startup.js",
    "assets/main.js",
    "assets/shared.js",
    "assets/react.js",
  ]);
  expect(
    budgetViolations(
      [
        { bytes: 1_000, path: "assets/startup.js" },
        { bytes: 449_001, path: "assets/main.js" },
      ],
      paths,
      { initialBytes: 450_000, largestFileBytes: 500_000 },
    ),
  ).toEqual([
    "Initial JavaScript is 450,001 bytes; the emitted initial-path budget is 450,000 bytes.",
  ]);
});

test("missing startup entries or imports cannot silently bypass the budget", () => {
  expect(() => initialJavaScriptPaths({}, ["src/main.tsx"])).toThrow("src/main.tsx");
  expect(() =>
    initialJavaScriptPaths({ "src/main.tsx": { file: "assets/main.js", imports: ["missing"] } }, [
      "src/main.tsx",
    ]),
  ).toThrow("missing");
});

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

test("terrain workers have a file budget but do not count toward initial JavaScript", () => {
  const artifacts = [
    { bytes: 250_000, path: "assets/index-abc.js" },
    { bytes: 300_000, path: "assets/terrain.worker-def.js" },
  ];
  expect(budgetViolations(artifacts, new Set([artifacts[0]!.path]))).toEqual([]);
  expect(budgetViolations([{ ...artifacts[1]!, bytes: 400_001 }], new Set())).toHaveLength(1);
});
