import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";
import { expect, test } from "vite-plus/test";
import { configureKtx2Transcoder, KTX2_TRANSCODER_URLS } from "./ktx2-transcoder.ts";

test("self-hosts every distinct Babylon KTX2 transcoder exactly once", () => {
  expect(KTX2_TRANSCODER_URLS.jsDecoderModule).not.toBe(
    "https://cdn.babylonjs.com/babylon.ktx2Decoder.js",
  );
  configureKtx2Transcoder();
  configureKtx2Transcoder();

  const entries = Object.entries(KhronosTextureContainer2.URLConfig);
  expect(entries.length).toBeGreaterThan(0);

  for (const [key, url] of entries) {
    expect(url, `URLConfig.${key} is not self-hosted`).toMatch(/^\/ktx2\/[\w.]+$/);
  }
  expect(Object.keys(KTX2_TRANSCODER_URLS).sort()).toEqual(
    Object.keys(KhronosTextureContainer2.URLConfig).sort(),
  );
  expect(KhronosTextureContainer2.URLConfig.jsDecoderModule).toBe(
    KTX2_TRANSCODER_URLS.jsDecoderModule,
  );
  const urls = Object.values(KTX2_TRANSCODER_URLS);

  expect(new Set(urls).size).toBe(urls.length);
});
