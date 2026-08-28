import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, test } from "vite-plus/test";
import { findAssetProvenanceGaps } from "./check-asset-provenance.mjs";

const fixtureDirectories = [];

const createFixture = async (files) => {
  const publicRootPath = await mkdtemp(path.join(tmpdir(), "exora-asset-provenance-"));
  fixtureDirectories.push(publicRootPath);
  await Promise.all(
    ["models", "textures"].map((directory) => mkdir(path.join(publicRootPath, directory))),
  );
  await Promise.all(
    files.map(async (file) => {
      const filePath = path.join(publicRootPath, file);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, "fixture");
    }),
  );
  return publicRootPath;
};

afterEach(async () => {
  await Promise.all(
    fixtureDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test("accepts documented model and texture assets", async () => {
  const publicRootPath = await createFixture(["models/body.obj", "textures/body.jpg"]);
  const result = await findAssetProvenanceGaps({
    provenance: "Documented assets: `body.obj` and `textures/body.jpg`.",
    publicRootPath,
  });

  expect(result).toEqual({
    assets: ["models/body.obj", "textures/body.jpg"],
    undocumented: [],
  });
});

test("reports undocumented supported assets", async () => {
  const publicRootPath = await createFixture(["models/documented.glb", "textures/missing.png"]);
  const result = await findAssetProvenanceGaps({
    provenance: "Documented asset: `documented.glb`.",
    publicRootPath,
  });

  expect(result.undocumented).toEqual(["textures/missing.png"]);
});

test("requires full paths when supported assets have duplicate basenames", async () => {
  const publicRootPath = await createFixture([
    "textures/ice/normal.ktx2",
    "textures/rock/normal.ktx2",
  ]);
  const result = await findAssetProvenanceGaps({
    provenance: "Only the ambiguous basename `normal.ktx2` is documented.",
    publicRootPath,
  });

  expect(result.undocumented).toEqual(["textures/ice/normal.ktx2", "textures/rock/normal.ktx2"]);
});

test("preserves nested asset paths for exact provenance matches", async () => {
  const publicRootPath = await createFixture(["models/catalog/body.obj"]);
  const result = await findAssetProvenanceGaps({
    provenance: "Documented asset: `models/catalog/body.obj`.",
    publicRootPath,
  });

  expect(result).toEqual({
    assets: ["models/catalog/body.obj"],
    undocumented: [],
  });
});

test("ignores hidden metadata and files with unsupported extensions", async () => {
  const publicRootPath = await createFixture([
    "models/.DS_Store",
    "models/solar-system/.DS_Store",
    "models/._body.obj",
    "textures/.cache/preview.jpg",
    "textures/Thumbs.db",
    "textures/notes.txt",
  ]);
  const result = await findAssetProvenanceGaps({ provenance: "", publicRootPath });

  expect(result).toEqual({ assets: [], undocumented: [] });
});
