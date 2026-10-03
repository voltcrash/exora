import styles from "./ui.module.css";

/** An orbit standing in for work in progress; decorative, so the caller says what is happening. */
export const Spinner = ({ size = 18 }: { size?: number }) => (
  <span className={styles["spinner"]} style={{ width: size, height: size }} aria-hidden="true" />
);
