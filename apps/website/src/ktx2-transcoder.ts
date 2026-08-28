import { KhronosTextureContainer2 } from "@babylonjs/core/Misc/khronosTextureContainer2.js";

const TRANSCODER_DIRECTORY = "/ktx2";

// Keep texture decoding local; Babylon's defaults point at a CDN.
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

export const configureKtx2Transcoder = (): void => {
  if (configured) return;
  configured = true;
  Object.assign(KhronosTextureContainer2.URLConfig, KTX2_TRANSCODER_URLS);
};
