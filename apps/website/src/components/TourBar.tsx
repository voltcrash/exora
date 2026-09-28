import type { ActiveTour } from "../tours.ts";
import styles from "./TourBar.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

interface TourBarProps {
  active: ActiveTour;
  hidden: boolean;
  onExit: () => void;
  onStep: (index: number) => void;
}

/** The running tour's caption and controls, floating over whichever destination it has reached. */
export const TourBar = ({ active: { index, tour }, hidden, onExit, onStep }: TourBarProps) => {
  const step = tour.steps[index];
  if (!step) return null;
  const last = index === tour.steps.length - 1;

  return (
    <section className={cx("tour")} data-hidden={hidden} aria-label={`Guided tour: ${tour.title}`}>
      <p className={cx("tour-eyebrow")}>
        <span>GUIDED TOUR</span>
        <span>
          {index + 1} / {tour.steps.length}
        </span>
        <span>{tour.title}</span>
      </p>
      <p className={cx("tour-caption")} aria-live="polite">
        <strong>{step.name}.</strong> {step.caption}
      </p>
      <ol className={cx("tour-progress")} aria-hidden="true">
        {tour.steps.map((entry, position) => (
          <li
            key={entry.name + String(position)}
            data-state={position < index ? "done" : position === index ? "here" : "ahead"}
          />
        ))}
      </ol>
      <div className={cx("tour-controls")}>
        <button type="button" disabled={index === 0} onClick={() => onStep(index - 1)}>
          ◀ PREVIOUS
        </button>
        {last ? (
          <button type="button" data-primary="true" onClick={onExit}>
            FINISH TOUR
          </button>
        ) : (
          <button type="button" data-primary="true" onClick={() => onStep(index + 1)}>
            NEXT · {tour.steps[index + 1]?.name.toUpperCase()} ▶
          </button>
        )}
        <button type="button" aria-label="Leave the tour" onClick={onExit}>
          ×
        </button>
      </div>
    </section>
  );
};
