import styles from "./shell.module.css";

export interface ControlHint {
  key: string;
  meaning: string;
}

/** How to move the camera, for a pointer and keyboard; touch needs no instructions to drag. */
export const ControlHints = ({
  failed,
  hints,
}: {
  failed: boolean;
  hints: readonly ControlHint[];
}) =>
  failed ? (
    <p className={styles["scene-alert"]} role="status">
      The renderer stopped. Reload the page to try again.
    </p>
  ) : (
    <ul
      className={styles["hints"]}
      data-testid="mission-control"
      aria-label="Pointer and keyboard controls"
    >
      {hints.map((hint) => (
        <li key={hint.key}>
          <kbd>{hint.key}</kbd>
          <span>{hint.meaning}</span>
        </li>
      ))}
    </ul>
  );
