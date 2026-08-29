import type { ReactNode } from "react";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(hudStyles);

export type IdentityTone = "black-hole" | "region" | "star" | "subsystem" | "world";

interface DestinationIdentityProps {
  category: string;
  classification: string;
  name: ReactNode;
  nameId: string;
  note: string;
  summary: string;
  tags: readonly string[];
  tagsLabel: string;
  tone: IdentityTone;
}

/*
 * WHO THIS IS — the one region of the main screen that never changes shape.
 *
 * A star with sixty catalogued worlds and a black hole with none introduce themselves with the
 * same five lines in the same place: what class of object this is, its name, three classification
 * chips, a sentence, and what the picture over it is honestly claiming. Everything a destination
 * additionally knows, offers or lets you leave for belongs to the panel opposite, so this column
 * cannot grow, cannot scroll, and cannot walk up the viewport as a destination gets richer.
 */
export const DestinationIdentity = ({
  category,
  classification,
  name,
  nameId,
  note,
  summary,
  tags,
  tagsLabel,
  tone,
}: DestinationIdentityProps) => (
  <section
    className={cx("identity")}
    data-testid="world-intro"
    data-tone={tone}
    aria-labelledby={nameId}
  >
    <p className={cx("identity-eyebrow")}>
      <span>{category}</span>
      <span>{classification}</span>
    </p>
    <h1 className={cx("identity-name")} id={nameId}>
      {name}
    </h1>
    <div className={cx("identity-tags")} aria-label={tagsLabel}>
      {tags.map((tag) => (
        <span key={tag}>{tag}</span>
      ))}
    </div>
    <p className={cx("identity-summary")}>{summary}</p>
    <p className={cx("identity-note")}>
      <span aria-hidden="true" /> {note}
    </p>
  </section>
);
