import { TOURS } from "../tours.ts";
import { Icon } from "./ui/Icon.tsx";
import styles from "./TourBar.module.css";

/** The tours on offer, each started by opening its first destination. */
export const TourCatalog = ({ onStart }: { onStart: (tourId: string) => void }) => (
  <ul className={styles["catalog"]}>
    {TOURS.map((tour) => (
      <li key={tour.id}>
        <button className={styles["catalog-card"]} type="button" onClick={() => onStart(tour.id)}>
          <span className={styles["catalog-route"]} aria-hidden="true">
            {tour.steps.map((step, index) => (
              <i key={`${step.name}-${String(index)}`} />
            ))}
          </span>
          <strong>{tour.title}</strong>
          <span>{tour.summary}</span>
          <small>
            {tour.steps[0]?.name} → {tour.steps.at(-1)?.name} · {tour.steps.length} stops
          </small>
          <span className={styles["catalog-start"]}>
            Start tour <Icon name="arrow-right" size={16} />
          </span>
        </button>
      </li>
    ))}
  </ul>
);
