import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const publicRoot = new URL("apps/website/public/", repositoryRoot);
const publicRootPath = fileURLToPath(publicRoot);
const provenance = await readFile(new URL("THIRD_PARTY_ASSETS.md", repositoryRoot), "utf8");
const assetDirectories = ["models", "textures"];

const assets = (
  await Promise.all(
    assetDirectories.map(async (directory) => {
      const entries = await readdir(new URL(`${directory}/`, publicRoot), {
        recursive: true,
        withFileTypes: true,
      });
      return entries
        .filter((entry) => entry.isFile())
        .map((entry) =>
          path
            .relative(publicRootPath, path.join(entry.parentPath, entry.name))
            .split(path.sep)
            .join("/"),
        );
    }),
  )
).flat();

const basenameCounts = new Map();
for (const asset of assets) {
  const basename = path.posix.basename(asset);
  basenameCounts.set(basename, (basenameCounts.get(basename) ?? 0) + 1);
}

const undocumented = assets.filter((asset) => {
  if (provenance.includes(`\`${asset}\``)) return false;
  const basename = path.posix.basename(asset);
  return basenameCounts.get(basename) !== 1 || !provenance.includes(`\`${basename}\``);
});

if (undocumented.length > 0) {
  console.error("The following shipped assets have no unambiguous provenance entry:");
  for (const asset of undocumented.sort()) console.error(`- ${asset}`);
  process.exitCode = 1;
} else {
  console.log(`Verified provenance coverage for ${assets.length} shipped models and textures.`);
}
