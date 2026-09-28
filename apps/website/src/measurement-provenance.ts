import type { ExoplanetObservation } from "@exora/contracts";

export interface ProvenanceReading {
  massLabel: string;
  massPrefix: string;
  note: string | null;
  radiusLabel: string;
  radiusPrefix: string;
  summary: string | null;
}

const MASS_NOTES = {
  estimated: "The mass is read off the archive's mass–radius relation, not weighed.",
  minimum:
    "The mass is a minimum (M sin i): radial velocity only sees the wobble along our line of sight.",
} as const;

const RADIUS_NOTE =
  "The radius is calculated by the archive from the mass; the world never transited.";

/** Labels a world's mass and radius by how the archive arrived at them. */
export const readProvenance = ({
  massProvenance,
  radiusProvenance,
}: Pick<ExoplanetObservation, "massProvenance" | "radiusProvenance">): ProvenanceReading => {
  const massNote =
    massProvenance === "minimum" || massProvenance === "estimated"
      ? MASS_NOTES[massProvenance]
      : null;
  const radiusNote = radiusProvenance === "estimated" ? RADIUS_NOTE : null;
  const notes = [massNote, radiusNote].filter((note) => note !== null);
  const qualifiers = [
    massProvenance === "minimum" && "Minimum mass",
    massProvenance === "estimated" && "Estimated mass",
    radiusProvenance === "estimated" && "Estimated radius",
  ].filter((qualifier) => qualifier !== false);

  return {
    massLabel:
      massProvenance === "minimum"
        ? "Min. mass"
        : massProvenance === "estimated"
          ? "Mass (est.)"
          : "Mass",
    massPrefix: massProvenance === "minimum" ? "≥" : massProvenance === "estimated" ? "~" : "",
    note: notes.length > 0 ? notes.join(" ") : null,
    radiusLabel: radiusProvenance === "estimated" ? "Radius (est.)" : "Radius",
    radiusPrefix: radiusProvenance === "estimated" ? "~" : "",
    summary: qualifiers.length > 0 ? qualifiers.join(" · ") : null,
  };
};
