import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";
import { expect, test } from "vite-plus/test";
import { configureKtx2Transcoder, KTX2_TRANSCODER_URLS } from "./ktx2-transcoder.ts";

test("Babylon ships pointing at its own CDN, which is what this module exists to undo", () => {
  // Guards the premise rather than the fix: if a future release stops defaulting to the CDN,
  // this whole module can go, and this is the test that says so.
  expect(KTX2_TRANSCODER_URLS.jsDecoderModule).not.toBe(
    "https://cdn.babylonjs.com/babylon.ktx2Decoder.js",
  );
});

test("every URL Babylon can request is served from this origin", () => {
  configureKtx2Transcoder();

  const entries = Object.entries(KhronosTextureContainer2.URLConfig);
  expect(entries.length).toBeGreaterThan(0);

  for (const [key, url] of entries) {
    // A null entry is not inert: the decoder falls back to the CDN URL it carries internally,
    // so an uncovered key leaves the origin just as surely as a hard-coded one.
    expect(url, `URLConfig.${key} is not self-hosted`).toMatch(/^\/ktx2\/[\w.]+$/);
  }
});

test("the configuration covers exactly the keys Babylon declares", () => {
  // A Babylon upgrade that adds a transcoder would otherwise reintroduce a CDN fetch silently.
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
