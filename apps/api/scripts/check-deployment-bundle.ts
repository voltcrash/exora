import { readdir, readFile } from "node:fs/promises";

const outputDirectory = new URL("../dist/", import.meta.url);
const outputFiles = await readdir(outputDirectory);
const modules = outputFiles.filter((file) => file.endsWith(".mjs"));

if (modules.length === 0) throw new Error("The API build did not emit any JavaScript modules.");

const workspaceImport = /(?:from\s*|import\s*)["']@exora\//;
for (const module of modules) {
  const source = new TextDecoder().decode(await readFile(new URL(module, outputDirectory)));
  if (workspaceImport.test(source)) {
    throw new Error(
      `${module} contains an unresolved @exora workspace import that cannot load on Vercel.`,
    );
  }
}

await import(new URL("vercel.mjs", outputDirectory).href);

console.log(`[deployment] verified ${modules.length} API modules and Vercel entry dependencies`);
