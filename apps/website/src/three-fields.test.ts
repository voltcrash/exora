import { expect, test } from "vite-plus/test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

test("the published Blender fields are directly decodable RGB textures", async () => {
  const base = new URL("../public/", import.meta.url);
  expect(existsSync(new URL("ktx2/", base))).toBe(false);
  for (const name of ["lithosphere", "convection", "photosphere", "accretion"]) {
    const data = await readFile(new URL(`textures/fields/${name}.png`, base));
    expect(new TextDecoder().decode(data.subarray(1, 4))).toBe("PNG");
    expect(new DataView(data.buffer, data.byteOffset).getUint32(16)).toBe(1024);
    expect(data[24]).toBe(8);
    expect(data[25]).toBe(2);
  }
});
