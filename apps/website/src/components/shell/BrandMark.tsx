import styles from "./shell.module.css";

/** A world on its orbit, the orbiting moon lit by whatever star the view is under. */
export const BrandMark = ({ size = 28 }: { size?: number }) => (
  <svg
    className={styles["brand-mark"]}
    width={size}
    height={size}
    viewBox="0 0 28 28"
    aria-hidden="true"
  >
    <circle className={styles["brand-orbit"]} cx="14" cy="14" r="11.5" />
    <circle className={styles["brand-world"]} cx="14" cy="14" r="5" />
    <circle className={styles["brand-moon"]} cx="22.1" cy="5.9" r="2.4" />
  </svg>
);
