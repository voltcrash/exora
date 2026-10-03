import type { ActiveTour } from "../tours.ts";
import { Button } from "./ui/Button.tsx";
import styles from "./TourBar.module.css";

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
  const next = tour.steps[index + 1];

  return (
    <section
      className={styles["tour"]}
      data-hidden={hidden}
      aria-label={`Guided tour: ${tour.title}`}
    >
      <header className={styles["tour-head"]}>
        <p>
          <span>{tour.title}</span>
          <span className={styles["tour-count"]}>
            Stop {index + 1} of {tour.steps.length}
          </span>
        </p>
        <Button
          icon="close"
          size="sm"
          variant="ghost"
          aria-label="Leave the tour"
          onClick={onExit}
        />
      </header>
      <ol className={styles["tour-progress"]} aria-hidden="true">
        {tour.steps.map((entry, position) => (
          <li
            key={entry.name + String(position)}
            data-state={position < index ? "done" : position === index ? "here" : "ahead"}
          />
        ))}
      </ol>
      <p className={styles["tour-caption"]} aria-live="polite">
        <strong>{step.name}.</strong> {step.caption}
      </p>
      <div className={styles["tour-controls"]}>
        <Button
          icon="chevron-left"
          size="sm"
          variant="ghost"
          disabled={index === 0}
          onClick={() => onStep(index - 1)}
        >
          Previous
        </Button>
        {last ? (
          <Button size="sm" variant="primary" icon="check" onClick={onExit}>
            Finish tour
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            iconEnd="arrow-right"
            onClick={() => onStep(index + 1)}
          >
            Next: {next?.name}
          </Button>
        )}
      </div>
    </section>
  );
};
