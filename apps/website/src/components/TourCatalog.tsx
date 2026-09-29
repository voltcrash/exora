import { TOURS } from "../tours.ts";
import styles from "./TourBar.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

/** The tours on offer, each started by opening its first destination. */
export const TourCatalog = ({ onStart }: { onStart: (tourId: string) => void }) => (
  <ul className={cx("tour-catalog")}>
    {TOURS.map((tour) => (
      <li key={tour.id}>
        <button type="button" onClick={() => onStart(tour.id)}>
          <small>{tour.steps.length} STOPS</small>
          <strong>{tour.title}</strong>
          <span>{tour.summary}</span>
          <em>
            {tour.steps[0]?.name} → {tour.steps.at(-1)?.name}
          </em>
        </button>
      </li>
    ))}
  </ul>
);
