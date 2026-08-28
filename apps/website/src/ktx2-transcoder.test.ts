import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";
import { expect, test } from "vite-plus/test";
import { configureKtx2Transcoder, KTX2_TRANSCODER_URLS } from "./ktx2-transcoder.ts";

test("Babylon ships pointing at its own CDN, which is what this module exists to undo", () => {
  expect(KTX2_TRANSCODER_URLS.jsDecoderModule).not.toBe(
    "https://cdn.babylonjs.com/babylon.ktx2Decoder.js",
  );
});

test("every URL Babylon can request is served from this origin", () => {
  configureKtx2Transcoder();

  const entries = Object.entries(KhronosTextureContainer2.URLConfig);
  expect(entries.length).toBeGreaterThan(0);

  for (const [key, url] of entries) {
    expect(url, `URLConfig.${key} is not self-hosted`).toMatch(/^\/ktx2\/[\w.]+$/);
  }
});

test("the configuration covers exactly the keys Babylon declares", () => {
  expect(Object.keys(KTX2_TRANSCODER_URLS).sort()).toEqual(
    Object.keys(KhronosTextureContainer2.URLConfig).sort(),
  );
});

test("applying the configuration twice is harmless", () => {
  configureKtx2Transcoder();
  configureKtx2Transcoder();

  expect(KhronosTextureContainer2.URLConfig.jsDecoderModule).toBe(
    KTX2_TRANSCODER_URLS.jsDecoderModule,
  );
});

test("each URL names a distinct file, so no transcoder shadows another", () => {
  const urls = Object.values(KTX2_TRANSCODER_URLS);

  expect(new Set(urls).size).toBe(urls.length);
});
