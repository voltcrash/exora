/**
 * The sliver of Node this package's unit suite needs, declared rather than installed.
 *
 * `vp test --project unit` runs on Node, and two suites read the bundled star catalogue off disk
 * so they can assert against the real asset instead of a hand-built imitation of it. That is the
 * only Node API any file under `src` touches.
 *
 * Pulling in `@types/node` for it would put the whole Node global surface — `process`, `Buffer`,
 * a `setTimeout` that returns a `Timeout` rather than a number — inside a package that ships to a
 * browser, and it makes `tsc` give up comparing Vite's `UserConfig` against `vite.config.ts`
 * ("excessive stack depth"). One accurate declaration costs neither.
 */
declare module "node:fs/promises" {
  export const readFile: (path: URL | string) => Promise<Uint8Array>;
}
