import { useLayoutEffect, useRef, type ReactNode } from "react";
import type { PanelLink } from "../destination-panel.ts";
import { capitalize, readable } from "../readable.ts";
import { bindStyles } from "../styles/bind-styles.ts";
import { onWebFontsReady } from "../web-fonts.ts";
import { Button } from "./ui/Button.tsx";
import { Icon } from "./ui/Icon.tsx";
import { Spinner } from "./ui/Spinner.tsx";
import styles from "./Destination.module.css";

const cx = bindStyles(styles);

export type IdentityTone = "black-hole" | "region" | "star" | "subsystem" | "world";

export interface DestinationIdentityProps {
  /** Where this object comes from: a confirmed world, a generated star, our own system. */
  category: string;
  classification: string;
  links?: readonly PanelLink[];
  name: ReactNode;
  nameId: string;
  /** What the picture is honestly claiming to be. */
  note: string;
  summary: string;
  tags: readonly string[];
  tagsLabel: string;
  tone: IdentityTone;
}

/*
 * A name is often one unbreakable word — SAGITTARIUS, HELIOSPHERE — set in an expanded face in a
 * column of fixed width, so whether it fits is a question about the live font rather than about
 * the design. The heading is measured rather than trusted: scaled down until its longest word is
 * inside the column, and measured again when the column resizes or the real font lands.
 */
const FIT_PASSES = 4;

const fitToColumn = (heading: HTMLElement): void => {
  // A heading with no column yet has no measurement to make, and scaling it to zero would be one.
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

const NextDestination = ({ link }: { link: PanelLink }) => (
  <Button
    className={cx("next-link")}
    icon={link.icon}
    variant="surface"
    disabled={link.disabled}
    aria-busy={link.busy || undefined}
    aria-pressed={link.pressed}
    onClick={link.onSelect}
  >
    {link.label}
    {link.busy ? <Spinner size={14} /> : null}
  </Button>
);

/*
 * WHO THIS IS, AND WHERE TO GO FROM HERE
 *
 * Every destination introduces itself the same way: what kind of object it is, its name, a few
 * classifying facts, a sentence, and what the picture behind it honestly claims to be. The places
 * it can be left for — its star, its whole system, its parent world — sit directly under the name,
 * because they are the next thing most people want.
 */
export const DestinationIdentity = ({
  category,
  classification,
  links = [],
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

  const errors = links.filter((link) => link.error);

  return (
    <section
      className={cx("identity")}
      data-testid="world-intro"
      data-tone={tone}
      aria-labelledby={nameId}
    >
      <div className={cx("identity-head")} data-sheet-grip>
        <p className={cx("identity-kind")}>
          <span className={cx("identity-category")}>{capitalize(readable(category))}</span>
          <span>{capitalize(readable(classification))}</span>
        </p>
        <h1 className={cx("identity-name")} id={nameId} ref={heading}>
          {name}
        </h1>
        <ul className={cx("identity-tags")} aria-label={tagsLabel} data-sheet-peek-end>
          {tags.map((tag) => (
            <li key={tag}>{readable(tag)}</li>
          ))}
        </ul>
      </div>

      <p className={cx("identity-summary")}>{summary}</p>

      {links.length > 0 ? (
        <nav className={cx("identity-next")} aria-label="Go from here">
          {links.map((link) => (
            <NextDestination key={link.id} link={link} />
          ))}
        </nav>
      ) : null}
      {errors.map((link) => (
        <p className={cx("identity-error")} key={link.id} role="status">
          {link.error}
        </p>
      ))}

      {note ? (
        <p className={cx("identity-note")}>
          <Icon name="info" size={14} />
          <span>{readable(note)}</span>
        </p>
      ) : null}
    </section>
  );
};
