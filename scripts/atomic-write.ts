import { randomUUID } from "node:crypto";
import { rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const atomicWrite = async (
  destination: URL,
  contents: string | Uint8Array,
): Promise<void> => {
  const temporary = `${fileURLToPath(destination)}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, contents, { flag: "wx" });
    await rename(temporary, destination);
  } finally {
    await rm(temporary, { force: true });
  }
};
