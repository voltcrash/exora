import { useEffect, useState } from "react";
import styles from "./shell.module.css";

export interface ControlHint {
  key: string;
  meaning: string;
}

const LINGER_MS = 8000;

// Once someone has moved the camera they know the controls, so later destinations stay quiet.
let learned = false;

/** How to move the camera, for a pointer and keyboard; touch needs no instructions to drag. */
export const ControlHints = ({
  failed,
  hints,
}: {
  failed: boolean;
  hints: readonly ControlHint[];
}) => {
  const [visible, setVisible] = useState(!learned);

  useEffect(() => {
    if (!visible) return;
    const dismiss = (): void => {
      learned = true;
      setVisible(false);
    };
    const canvas = document.getElementById("render-canvas");
    const timer = window.setTimeout(() => setVisible(false), LINGER_MS);
    canvas?.addEventListener("pointerdown", dismiss, { once: true });
    canvas?.addEventListener("wheel", dismiss, { once: true, passive: true });
    return () => {
      window.clearTimeout(timer);
      canvas?.removeEventListener("pointerdown", dismiss);
      canvas?.removeEventListener("wheel", dismiss);
    };
  }, [visible]);

  if (failed) {
    return (
      <p className={styles["scene-alert"]} role="status">
        The renderer stopped. Reload the page to try again.
      </p>
    );
  }

  return (
    <ul
      className={styles["hints"]}
      data-testid="mission-control"
      data-visible={visible}
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
};
