/*
 * Archive readings and model notes were written for an all-caps interface, and some of them are
 * still produced that way by the modules that compute them. The interface reads in sentence case,
 * so a string with no lowercase letter is brought down to one — keeping acronyms, units and
 * designations, which are the words whose capitals carry meaning.
 */

const KEEP = new Set([
  "AR",
  "AU",
  "CMB",
  "DEC",
  "EHT",
  "ESA",
  "ESI",
  "FPS",
  "HR",
  "HST",
  "HZ",
  "IAU",
  "ID",
  "IR",
  "JPL",
  "JWST",
  "K",
  "KM",
  "LY",
  "NAIF",
  "NASA",
  "PC",
  "RA",
  "RV",
  "SIMBAD",
  "SPK",
  "TAP",
  "TDB",
  "TESS",
  "UTC",
  "UV",
  "XR",
]);

const LOWERCASE_UNITS = new Map([
  ["KM", "km"],
  ["PC", "pc"],
  ["LY", "ly"],
  ["DAYS", "days"],
  ["MAG", "mag"],
  ["AU", "AU"],
]);

const hasLowercase = /\p{Ll}/u;

const tidyPart = (part: string): string => {
  const bare = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (bare.length === 0) return part;
  if (KEEP.has(bare) || /\d/.test(bare) || bare.length === 1) return part;
  return part.toLowerCase();
};

// "NASA/JPL" and "LOG-COMPRESSED" are judged a part at a time.
const tidyWord = (word: string): string =>
  word
    .split(/([/])/)
    .map((part) => (part === "/" ? part : tidyPart(part)))
    .join("");

const readableClause = (clause: string): string => {
  if (hasLowercase.test(clause)) return clause;
  const lowered = clause
    .split(/(\s+)/)
    .map((part) => (/^\s+$/.test(part) ? part : tidyWord(part)))
    .join("");
  // Each sentence inside the clause starts with a capital of its own.
  return lowered.replace(
    /(^|[.:!?—]\s*)(\p{Ll})/gu,
    (_match, lead: string, letter: string) => lead + letter.toUpperCase(),
  );
};

/**
 * Sentence case for whatever was written in capitals. Each clause between middle dots is judged
 * on its own, so "r^0.4 · EARTH ×600" keeps its exponent and loses its shouting.
 */
export const readable = (text: string): string =>
  text
    .split(/(\s·\s)/)
    .map((clause) => (clause.includes("·") ? clause : readableClause(clause)))
    .join("");

/** The way a unit is set beside a value: lowercase where SI writes it so, as given otherwise. */
export const readableUnit = (unit: string): string => LOWERCASE_UNITS.get(unit) ?? unit;

/** The first letter raised, for labels assembled from lowercase identifiers like "ice giant". */
export const capitalize = (text: string): string =>
  text.length === 0 ? text : text[0]!.toUpperCase() + text.slice(1);
