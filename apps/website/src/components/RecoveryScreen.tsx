import { BrandMark } from "./shell/BrandMark.tsx";
import { Button } from "./ui/Button.tsx";
import { Spinner } from "./ui/Spinner.tsx";
import styles from "./RecoveryScreen.module.css";

interface RecoveryScreenProps {
  action: string;
  detail: string;
  heading: string;
  onRetry: () => void;
  pending?: boolean;
}

/** Something stopped. Says what, and offers the one action most likely to fix it. */
export const RecoveryScreen = ({
  action,
  detail,
  heading,
  onRetry,
  pending = false,
}: RecoveryScreenProps) => (
  <div
    className={styles["recovery"]}
    role={pending ? "status" : "alert"}
    aria-live={pending ? "polite" : "assertive"}
  >
    <div className={styles["recovery-card"]}>
      {pending ? <Spinner size={28} /> : <BrandMark size={32} />}
      <h1>{heading}</h1>
      <p>{detail}</p>
      <Button variant={pending ? "secondary" : "primary"} onClick={onRetry}>
        {action}
      </Button>
    </div>
  </div>
);
