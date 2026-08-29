import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);
interface RecoveryScreenProps {
  action: string;
  detail: string;
  heading: string;
  onRetry: () => void;
  pending?: boolean;
}

export const RecoveryScreen = ({
  action,
  detail,
  heading,
  onRetry,
  pending = false,
}: RecoveryScreenProps) => (
  <div
    className={cx("recovery-screen")}
    role={pending ? "status" : "alert"}
    aria-live={pending ? "polite" : "assertive"}
  >
    <div className={cx("recovery-orbit")} aria-hidden="true">
      <span />
    </div>
    <p>OBSERVATORY INTERRUPTED</p>
    <h1>{heading}</h1>
    <small>{detail}</small>
    <button type="button" onClick={onRetry}>
      {action}
    </button>
  </div>
);
