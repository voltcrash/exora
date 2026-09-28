declare module "node:fs/promises" {
  export const readFile: (path: URL | string) => Promise<Uint8Array>;
}

declare module "node:vm" {
  export const runInNewContext: (code: string, context: Record<string, unknown>) => unknown;
}
