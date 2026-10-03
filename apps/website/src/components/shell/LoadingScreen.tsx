import { useTypographySettled } from "../../use-typography-settled.ts";
import styles from "./shell.module.css";

interface LoadingScreenProps {
  detail: string;
  /** Kept on screen regardless of the destination's state, as the app does before one exists. */
  standalone?: boolean;
  title: string;
}

/*
 * Covers the canvas while a destination assembles. The copy waits for the typeface so it is not
 * drawn once in the platform sans and again a moment later; the destination's `scene-ready` class
 * is what lifts it.
 */
export const LoadingScreen = ({ detail, standalone = false, title }: LoadingScreenProps) => {
  const typographySettled = useTypographySettled();
  return (
    <div
      className={styles["loading"]}
      data-standalone={standalone || undefined}
      data-type-settled={typographySettled || undefined}
      role="status"
    >
      <svg className={styles["loading-mark"]} viewBox="0 0 48 48" aria-hidden="true">
        <circle cx="24" cy="24" r="20" />
        <circle className={styles["loading-body"]} cx="24" cy="4" r="3" />
      </svg>
      <p>{title}</p>
      <small>{detail}</small>
    </div>
  );
};
