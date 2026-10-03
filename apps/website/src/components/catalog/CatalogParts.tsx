import { memo, type ReactNode, type Ref } from "react";
import { Button } from "../ui/Button.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Segmented } from "../ui/Segmented.tsx";
import { Spinner } from "../ui/Spinner.tsx";
import styles from "./catalog.module.css";

/*
 * The pieces every catalogue in Explore is assembled from, so a world, a star and a black hole are
 * searched, filtered and listed the same way: a search field with a way to be surprised, a rail of
 * collections, a toolbar saying what is shown, and cards.
 */

export type ResultView = "gallery" | "list";

interface CatalogSearchProps {
  describedBy?: string;
  label: string;
  onChange: (value: string) => void;
  onRandom?: () => void;
  placeholder: string;
  randomBusy?: boolean;
  randomError?: boolean;
  randomLabel?: string;
  resultsId?: string;
  value: string;
}

export const CatalogSearch = ({
  describedBy,
  label,
  onChange,
  onRandom,
  placeholder,
  randomBusy = false,
  randomError = false,
  randomLabel,
  resultsId,
  value,
}: CatalogSearchProps) => (
  <div className={styles["search"]} data-style-role="catalog-search" role="search">
    <label className={styles["search-field"]}>
      <Icon name="search" size={18} />
      <span className="visually-hidden">{label}</span>
      <input
        type="search"
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        aria-controls={resultsId}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
    {onRandom && randomLabel ? (
      <Button
        className={styles["random"]}
        icon="dice"
        disabled={randomBusy}
        aria-busy={randomBusy || undefined}
        title={randomError ? "The archive did not answer. Try again." : undefined}
        onClick={onRandom}
      >
        {randomLabel}
      </Button>
    ) : null}
  </div>
);

export interface Chip {
  id: string;
  label: string;
  note?: string;
}

interface ChipRailProps {
  active: string | null;
  allLabel?: string;
  groups: readonly { chips: readonly Chip[]; label: string }[];
  label: string;
  onSelect: (id: string | null) => void;
}

/** Collections and kinds as one scrolling row; the active chip's note explains what it holds. */
export const ChipRail = ({ active, allLabel, groups, label, onSelect }: ChipRailProps) => {
  const note = groups.flatMap((group) => group.chips).find((chip) => chip.id === active)?.note;
  return (
    <div className={styles["rail"]}>
      <div className={styles["chips"]} role="group" aria-label={label}>
        {allLabel ? (
          <button
            className={styles["chip"]}
            type="button"
            aria-pressed={active === null}
            onClick={() => onSelect(null)}
          >
            {allLabel}
          </button>
        ) : null}
        {groups.map((group) => (
          <span
            key={group.label}
            className={styles["chip-group"]}
            role="group"
            aria-label={group.label}
          >
            {group.chips.map((chip) => (
              <button
                key={chip.id}
                className={styles["chip"]}
                type="button"
                aria-pressed={active === chip.id}
                onClick={() => onSelect(chip.id)}
              >
                {chip.label}
              </button>
            ))}
          </span>
        ))}
      </div>
      {note ? <p className={styles["rail-note"]}>{note}</p> : null}
    </div>
  );
};

interface ResultToolbarProps {
  children?: ReactNode;
  label: string;
  onViewChange: (view: ResultView) => void;
  status: string;
  statusId?: string;
  view: ResultView;
}

export const ResultToolbar = ({
  children,
  label,
  onViewChange,
  status,
  statusId,
  view,
}: ResultToolbarProps) => (
  <div className={styles["toolbar"]}>
    <p id={statusId} className={styles["status"]} role="status">
      {status}
    </p>
    <div className={styles["toolbar-actions"]}>
      {children}
      <Segmented
        label={label}
        options={[
          { icon: "grid", id: "gallery", label: "Gallery" },
          { icon: "list", id: "list", label: "List" },
        ]}
        value={view}
        onChange={onViewChange}
      />
    </div>
  </div>
);

export const DidYouMean = ({
  onAccept,
  suggestion,
}: {
  onAccept: () => void;
  suggestion: string;
}) => (
  <button className={styles["did-you-mean"]} type="button" onClick={onAccept}>
    Did you mean <strong>{suggestion}</strong>?
  </button>
);

interface ResultListProps {
  children: ReactNode;
  id?: string;
  testId?: string;
  view: ResultView;
}

export const ResultList = ({ children, id, testId, view }: ResultListProps) => (
  <ol id={id} className={styles["results"]} data-view={view} data-testid={testId}>
    {children}
  </ol>
);

interface ResultCardProps {
  disabled?: boolean;
  facts: readonly string[];
  /** A short note when the result cannot be opened, in place of its facts. */
  notice?: string;
  onSelect: () => void;
  subtitle: string;
  title: string;
  trait?: string;
  visual: ReactNode;
}

export const ResultCard = memo(
  ({
    disabled = false,
    facts,
    notice,
    onSelect,
    subtitle,
    title,
    trait,
    visual,
  }: ResultCardProps) => (
    <li>
      <button className={styles["card"]} type="button" disabled={disabled} onClick={onSelect}>
        <span className={styles["card-visual"]}>{visual}</span>
        <span className={styles["card-copy"]}>
          <strong>{title}</strong>
          <small>{subtitle}</small>
          {trait ? <span className={styles["card-trait"]}>{trait}</span> : null}
        </span>
        <span className={styles["card-facts"]}>
          {notice ? <em>{notice}</em> : facts.map((fact) => <span key={fact}>{fact}</span>)}
        </span>
      </button>
    </li>
  ),
);

interface ResultStateProps {
  children: ReactNode;
  kind: "empty" | "error" | "loading" | "more";
  ref?: Ref<HTMLLIElement>;
  testId?: string;
}

export const ResultState = ({ children, kind, ref, testId }: ResultStateProps) => (
  <li
    ref={ref}
    className={styles["state"]}
    data-kind={kind}
    data-testid={testId}
    aria-live={kind === "more" ? "polite" : undefined}
  >
    {kind === "loading" || kind === "more" ? <Spinner size={16} /> : null}
    <span>{children}</span>
  </li>
);
