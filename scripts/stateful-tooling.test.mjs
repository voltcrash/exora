import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { expect, test } from "vite-plus/test";
import { atomicWrite } from "./atomic-write.ts";
import { assertCatalogSize } from "../apps/api/scripts/catalog-refresh.ts";
import { parseCsvLine } from "../apps/website/scripts/csv.ts";

test("atomic catalog replacement leaves no partial temporary files", async () => {
  const directory = await mkdtemp(`${tmpdir()}/exora-write-`);
  try {
    const file = pathToFileURL(`${directory}/catalog.json`);
    await atomicWrite(file, "old");
    await atomicWrite(file, "new");
    expect(await readFile(file, "utf8")).toBe("new");
    expect(await readdir(directory)).toEqual(["catalog.json"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("catalog shrink needs an explicit override and never permits near-empty output", () => {
  expect(() => assertCatalogSize(3_000, 6_000)).toThrow("refusing");
  expect(() => assertCatalogSize(3_000, 6_000, true)).not.toThrow();
  expect(() => assertCatalogSize(999, 6_000, true)).toThrow();
});

test("CSV quote states reject malformed and multiline records", () => {
  expect(parseCsvLine('one,"two,three","four""five"\r')).toEqual(["one", "two,three", 'four"five']);
  expect(() => parseCsvLine('one,"unfinished')).toThrow("Unterminated");
  expect(() => parseCsvLine('"one"garbage')).toThrow("Malformed");
  expect(() => parseCsvLine('"one\ntwo"')).toThrow("Multiline");
});
