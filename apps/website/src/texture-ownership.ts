import type { BaseTexture } from "@babylonjs/core/Materials/Textures/baseTexture.js";

const shared = new WeakSet<BaseTexture>();

export const retainSceneTexture = <Texture extends BaseTexture>(texture: Texture): Texture => {
  shared.add(texture);
  return texture;
};

export const isSceneTexture = (texture: BaseTexture): boolean => shared.has(texture);
