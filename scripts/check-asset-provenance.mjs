import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = new URL("../", import.meta.url);
const publicRoot = new URL("apps/website/public/", repositoryRoot);
const supportedAssetExtensions = new Map([
  ["models", new Set([".glb", ".obj", ".stl"])],
  ["textures", new Set([".jpg", ".jpeg", ".ktx2", ".png", ".webp"])],
]);

const isHiddenPath = (assetPath) => assetPath.split("/").some((part) => part.startsWith("."));

export const findAssetProvenanceGaps = async ({ publicRootPath, provenance }) => {
  const assets = (
    await Promise.all(
      [...supportedAssetExtensions].map(async ([directory, extensions]) => {
        const entries = await readdir(path.join(publicRootPath, directory), {
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
          )
          .filter(
            (asset) =>
              !isHiddenPath(asset) && extensions.has(path.posix.extname(asset).toLowerCase()),
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

  return { assets: assets.sort(), undocumented: undocumented.sort() };
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const provenance = await readFile(new URL("THIRD_PARTY_ASSETS.md", repositoryRoot), "utf8");
  const result = await findAssetProvenanceGaps({
    provenance,
    publicRootPath: fileURLToPath(publicRoot),
  });

  if (result.undocumented.length > 0) {
    console.error("The following shipped assets have no unambiguous provenance entry:");
    for (const asset of result.undocumented) console.error(`- ${asset}`);
    process.exitCode = 1;
  } else {
    console.log(
      `Verified provenance coverage for ${result.assets.length} shipped models and textures.`,
    );
  }
}
