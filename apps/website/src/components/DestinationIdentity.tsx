import { useLayoutEffect, useRef, type ReactNode } from "react";
import hudStyles from "./DestinationHud.module.css";
import { bindStyles } from "../styles/bind-styles.ts";
import { onWebFontsReady } from "../web-fonts.ts";

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
 * A name is one unbreakable word — SAGITTARIUS, HELIOSPHERE — and the column holding it is a fixed
 * width, so whether it fits is a question about the live font rather than about the design. Exora
 * asks for its webfont a second after the first paint, and platform sans faces run up to 13% wider
 * than Exo 2, so the heading is measured rather than trusted: it is scaled down until its longest
 * word is inside the column, and measured again when the column resizes or the real font lands.
 */
const FIT_PASSES = 4;

const fitToColumn = (heading: HTMLElement): void => {
  // A heading with no column yet — offscreen, unmounted, a viewport still being sized — has no
  // measurement to make, and scaling it to a width of zero would be one.
  if (heading.clientWidth === 0) return;

  heading.style.removeProperty("--identity-name-fit");
  for (let pass = 0; pass < FIT_PASSES && heading.scrollWidth > heading.clientWidth; pass += 1) {
    const fit = Number.parseFloat(heading.style.getPropertyValue("--identity-name-fit") || "1");
    heading.style.setProperty(
      "--identity-name-fit",
      String(fit * (heading.clientWidth / heading.scrollWidth)),
    );
  }
};

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
}: DestinationIdentityProps) => {
  const heading = useRef<HTMLHeadingElement>(null);
  const fittedName = useRef<string | null>(null);

  // The name arrives as a node, so what was rendered is the only honest signal that the heading
  // now introduces a different destination and has to be measured again.
  useLayoutEffect(() => {
    const element = heading.current;
    if (!element || element.textContent === fittedName.current) return;
    fittedName.current = element.textContent;
    fitToColumn(element);
  });

  useLayoutEffect(() => {
    const element = heading.current;
    if (!element) return;
    const refit = (): void => fitToColumn(element);

    let column = element.clientWidth;
    const observer = new ResizeObserver(() => {
      if (element.clientWidth === column) return;
      column = element.clientWidth;
      refit();
    });
    observer.observe(element);
    const stopListening = onWebFontsReady(refit);

    return () => {
      observer.disconnect();
      stopListening();
    };
  }, []);

  return (
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
      <h1 className={cx("identity-name")} id={nameId} ref={heading}>
        {name}
      </h1>
      <div className={cx("identity-tags")} aria-label={tagsLabel}>
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
      <p className={cx("identity-summary")}>{summary}</p>
      {note ? (
        <p className={cx("identity-note")}>
          <span aria-hidden="true" /> {note}
        </p>
      ) : null}
    </section>
  );
};
