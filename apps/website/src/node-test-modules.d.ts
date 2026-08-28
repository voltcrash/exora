declare module "node:fs/promises" {
  export const readFile: (path: URL | string) => Promise<Uint8Array>;
}
