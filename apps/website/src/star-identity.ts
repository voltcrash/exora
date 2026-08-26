import type { StarProfile } from "@exora/contracts";

/**
 * Spellings worth trying when crossing from a SIMBAD star to NASA's host-star catalog.
 *
 * The archives describe the same object with different identifiers. SIMBAD returns those
 * identifiers in preference order; cleaning its namespace markers produces the host spellings
 * NASA accepts while preserving the route-provided NASA name as the first choice.
 */
export const starSystemAliases = (
  star: StarProfile,
  nasaHostName: string | null = null,
): readonly string[] => {
  const aliases = star.aliases ?? [];
  const candidates = [
    nasaHostName,
    star.name,
    ...aliases.filter((alias) => /^NAME\s+/i.test(alias)),
    ...aliases,
    star.catalogName,
  ];
  return [
    ...new Map(
      candidates
        .filter((candidate): candidate is string => Boolean(candidate?.trim()))
        .map((candidate) =>
          candidate
            .replace(/^NAME\s+/i, "")
            .replace(/^\*\s+/, "")
            .trim(),
        )
        .filter(Boolean)
        .map((candidate) => [candidate.toLocaleLowerCase(), candidate]),
    ).values(),
  ].slice(0, 16);
};
