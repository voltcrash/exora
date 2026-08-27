import {
  WORLDGEN_VERSION,
  type CustomPlanetParameters,
  type CustomStarParameters,
} from "@exora/worldgen";

type CustomDestinationRecipe =
  | { parameters: CustomPlanetParameters; type: "planet"; version: number }
  | { parameters: CustomStarParameters; type: "star"; version: number };

const MAX_RECIPE_LENGTH = 2_048;
const PLANET_KINDS = new Set<CustomPlanetParameters["kind"]>(["gas-giant", "ice-giant", "rocky"]);
const STAR_KINDS = new Set<CustomStarParameters["kind"]>([
  "binary",
  "evolved",
  "main-sequence",
  "neutron-star",
  "variable",
  "white-dwarf",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNumberBetween = (value: unknown, minimum: number, maximum: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;

const isName = (value: unknown): value is string => typeof value === "string" && value.length <= 32;

const isUnit = (value: unknown): value is number => isNumberBetween(value, 0, 1);

const isPlanetParameters = (value: unknown): value is CustomPlanetParameters => {
  if (!isRecord(value)) return false;
  const color = value.baseColor;
  return (
    isUnit(value.activity) &&
    isUnit(value.atmosphere) &&
    isUnit(value.axialTilt) &&
    Array.isArray(color) &&
    color.length === 3 &&
    color.every(isUnit) &&
    typeof value.kind === "string" &&
    PLANET_KINDS.has(value.kind as CustomPlanetParameters["kind"]) &&
    isName(value.name) &&
    isUnit(value.radius) &&
    typeof value.rings === "boolean" &&
    isUnit(value.rotation) &&
    Number.isInteger(value.seed) &&
    isNumberBetween(value.seed, 0, 999_999) &&
    isNumberBetween(value.temperatureKelvin, 60, 2_400) &&
    isUnit(value.water)
  );
};

const isStarParameters = (value: unknown): value is CustomStarParameters => {
  if (!isRecord(value)) return false;
  return (
    isUnit(value.activity) &&
    typeof value.kind === "string" &&
    STAR_KINDS.has(value.kind as CustomStarParameters["kind"]) &&
    isName(value.name) &&
    isUnit(value.radius) &&
    isUnit(value.rotation) &&
    Number.isInteger(value.seed) &&
    isNumberBetween(value.seed, 0, 999_999) &&
    isNumberBetween(value.temperatureKelvin, 2_000, 40_000)
  );
};

const encodeBase64Url = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

const decodeBase64Url = (value: string): string => {
  if (!/^[A-Za-z0-9_-]+$/.test(value) || value.length > MAX_RECIPE_LENGTH) {
    throw new Error("Invalid custom destination encoding.");
  }
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, "="));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
};

const encodeRecipe = (recipe: CustomDestinationRecipe): string =>
  encodeBase64Url(JSON.stringify(recipe));

const decodeRecipe = (value: string): CustomDestinationRecipe | null => {
  try {
    const recipe: unknown = JSON.parse(decodeBase64Url(value));
    if (!isRecord(recipe) || recipe.version !== WORLDGEN_VERSION) return null;
    if (recipe.type === "planet" && isPlanetParameters(recipe.parameters)) {
      return {
        parameters: recipe.parameters,
        type: "planet",
        version: WORLDGEN_VERSION,
      };
    }
    if (recipe.type === "star" && isStarParameters(recipe.parameters)) {
      return { parameters: recipe.parameters, type: "star", version: WORLDGEN_VERSION };
    }
    return null;
  } catch {
    return null;
  }
};

export const customPlanetUrl = (parameters: CustomPlanetParameters): string =>
  `?custom=${encodeRecipe({ parameters, type: "planet", version: WORLDGEN_VERSION })}`;

export const customStarUrl = (parameters: CustomStarParameters): string =>
  `?customStar=${encodeRecipe({ parameters, type: "star", version: WORLDGEN_VERSION })}`;

export const parseCustomPlanetUrl = (value: string): CustomPlanetParameters | null => {
  const recipe = decodeRecipe(value);
  return recipe?.type === "planet" ? recipe.parameters : null;
};

export const parseCustomStarUrl = (value: string): CustomStarParameters | null => {
  const recipe = decodeRecipe(value);
  return recipe?.type === "star" ? recipe.parameters : null;
};
