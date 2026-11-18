export type InitialSceneAsset = "black-hole" | "planet" | "region" | "star" | "system";

export const initialSceneAssetForSearch = (search: string): InitialSceneAsset => {
  const parameters = new URLSearchParams(search);
  if (parameters.has("blackHole") || parameters.has("customBlackHole")) return "black-hole";
  if (parameters.has("region")) return "region";
  if (parameters.has("star") || parameters.has("customStar")) return "star";
  if (parameters.has("system")) return "system";
  return "planet";
};

const destinationModules = {
  "black-hole": () => import("./three/black-hole.ts"),
  planet: () => import("./three/planet.ts"),
  region: () => import("./three/region.ts"),
  star: () => import("./three/star.ts"),
  system: () => import("./three/system.ts"),
};
export const preloadInitialDestination = (search: string) =>
  destinationModules[initialSceneAssetForSearch(search)]();
