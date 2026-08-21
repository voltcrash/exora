/**
 * Points Babylon's KTX2 pipeline at Exora's own origin.
 *
 * Every rocky world's detail maps are KTX2, which the GPU cannot read directly: UASTC normals and
 * ETC1S roughness both have to be transcoded to whatever compressed format the device supports.
 * Babylon does that in a worker, and out of the box it fetches the decoder and its transcoders
 * from `https://cdn.babylonjs.com` — `KhronosTextureContainer2.URLConfig.jsDecoderModule` points
 * there, and the nine URLs the decoder resolves for itself when the rest of `URLConfig` is left
 * null point there too.
 *
 * That put roughly half a megabyte of third-party fetching on the critical path of a texture the
 * site already serves itself: an origin Exora does not control deciding whether a world gets its
 * surface, a cross-origin request no visitor agreed to, and an extra connection opened before the
 * first map can be decoded. It also quietly contradicted the offline story — the caches and the
 * bundled profile keep Exora alive when NASA or SIMBAD is unreachable, but nothing kept it alive
 * when a CDN was.
 *
 * So all ten are served from `/ktx2`. See `THIRD_PARTY_ASSETS.md` for their provenance and the
 * refresh procedure when `@babylonjs/core` is upgraded.
 */

import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";

const TRANSCODER_DIRECTORY = "/ktx2";

/**
 * Every entry of Babylon's `URLConfig`, pinned to this origin.
 *
 * Left null, an entry does not become inert — it falls back to the CDN URL the decoder carries
 * internally. Covering the whole record is what makes the pipeline self-hosted, so a key added by
 * a later Babylon release has to be added here too; `ktx2-transcoder.test.ts` fails when one is
 * missing rather than letting the request quietly leave the origin again.
 */
export const KTX2_TRANSCODER_URLS = {
  jsDecoderModule: `${TRANSCODER_DIRECTORY}/babylon.ktx2Decoder.js`,
  jsMSCTranscoder: `${TRANSCODER_DIRECTORY}/msc_basis_transcoder.js`,
  wasmMSCTranscoder: `${TRANSCODER_DIRECTORY}/msc_basis_transcoder.wasm`,
  wasmUASTCToASTC: `${TRANSCODER_DIRECTORY}/uastc_astc.wasm`,
  wasmUASTCToBC7: `${TRANSCODER_DIRECTORY}/uastc_bc7.wasm`,
  wasmUASTCToR8_UNORM: `${TRANSCODER_DIRECTORY}/uastc_r8_unorm.wasm`,
  wasmUASTCToRG8_UNORM: `${TRANSCODER_DIRECTORY}/uastc_rg8_unorm.wasm`,
  wasmUASTCToRGBA_SRGB: `${TRANSCODER_DIRECTORY}/uastc_rgba8_srgb_v2.wasm`,
  wasmUASTCToRGBA_UNORM: `${TRANSCODER_DIRECTORY}/uastc_rgba8_unorm_v2.wasm`,
  wasmZSTDDecoder: `${TRANSCODER_DIRECTORY}/zstddec.wasm`,
} as const satisfies Record<keyof typeof KhronosTextureContainer2.URLConfig, string>;

let configured = false;

/**
 * Applies the configuration. Safe to call repeatedly, and must run before the first KTX2 texture
 * is constructed — Babylon reads `URLConfig` once, when it builds its decoder worker pool.
 */
export const configureKtx2Transcoder = (): void => {
  if (configured) return;
  configured = true;
  Object.assign(KhronosTextureContainer2.URLConfig, KTX2_TRANSCODER_URLS);
};
