import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";

const [sourceDirectory, outputDirectory] = process.argv.slice(2);
if (!sourceDirectory || !outputDirectory || !process.env.KTX_BIN) {
  throw new Error(
    "Usage: KTX_BIN=/path/to/bin vpx scripts/encode-detail-normals.mjs SOURCE OUTPUT",
  );
}
for (const family of ["basalt", "cracked", "granite", "ice", "regolith"]) {
  const output = path.join(outputDirectory, family, "normal.ktx2");
  mkdirSync(path.dirname(output), { recursive: true });
  execFileSync(
    path.join(process.env.KTX_BIN, "toktx"),
    [
      "--encode",
      "uastc",
      "--uastc_quality",
      "3",
      "--uastc_rdo_l",
      "0.5",
      "--zcmp",
      "18",
      "--threads",
      "4",
      "--genmipmap",
      "--filter",
      "lanczos4",
      "--assign_oetf",
      "linear",
      "--normal_mode",
      "--normalize",
      "--input_swizzle",
      "rg01",
      "--scale",
      "0.5",
      output,
      path.join(sourceDirectory, family, "normal.png"),
    ],
    { stdio: "inherit" },
  );
  execFileSync(path.join(process.env.KTX_BIN, "ktx"), ["validate", output], { stdio: "inherit" });
}
