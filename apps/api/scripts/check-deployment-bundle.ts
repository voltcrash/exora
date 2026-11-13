import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Cloudflare's Workers Free limit on the compressed script; the Paid limit is larger.
const MAX_WORKER_GZIP_BYTES = 3 * 1024 * 1024;

const outputDirectory = new URL("../dist/", import.meta.url);
const outputFiles = await readdir(outputDirectory);
const modules = outputFiles.filter((file) => file.endsWith(".mjs"));

if (modules.length === 0) throw new Error("The API build did not emit any JavaScript modules.");

const sources = new Map<string, string>();
for (const module of modules) {
  sources.set(module, new TextDecoder().decode(await readFile(new URL(module, outputDirectory))));
}

const workspaceImport = /(?:from\s*|import\s*)["']@exora\//;
for (const [module, source] of sources) {
  if (workspaceImport.test(source)) {
    throw new Error(`${module} contains an unresolved @exora workspace import.`);
  }
}

// Every module the Worker loads, which must run without the Node.js compatibility layer.
const workerModules = new Set<string>();
const visit = (module: string): void => {
  if (workerModules.has(module)) return;
  const source = sources.get(module);
  if (source === undefined) throw new Error(`The Worker imports ${module}, which was not emitted.`);
  workerModules.add(module);
  for (const [, specifier] of source.matchAll(/(?:from|import)\s*["'](\.\/[^"']+)["']/g)) {
    visit(specifier!.slice(2));
  }
};
visit("worker.mjs");

let workerBytes = 0;
for (const module of workerModules) {
  const source = sources.get(module)!;
  if (/(?:from\s*|import\s*\(?\s*)["']node:/.test(source)) {
    throw new Error(`${module} imports a Node.js built-in, which Workers cannot load.`);
  }
  workerBytes += gzipSync(source).byteLength;
}
if (workerBytes > MAX_WORKER_GZIP_BYTES) {
  throw new Error(`The Worker is ${workerBytes} bytes gzipped, over ${MAX_WORKER_GZIP_BYTES}.`);
}

const { default: worker } = (await import(new URL("worker.mjs", outputDirectory).href)) as {
  default: { fetch: (request: Request, env: unknown, context: unknown) => Promise<Response> };
};
const health = await worker.fetch(
  new Request("https://exora.test/api/health"),
  {},
  {
    waitUntil: () => undefined,
  },
);
if (health.status !== 200)
  throw new Error(`The Worker answered /api/health with ${health.status}.`);

console.log(
  `[deployment] verified ${modules.length} API modules; Worker is ${workerModules.size} modules, ` +
    `${workerBytes.toLocaleString("en")} bytes gzipped, with no Node.js built-ins`,
);
