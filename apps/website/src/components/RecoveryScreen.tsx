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
    className="recovery-screen"
    role={pending ? "status" : "alert"}
    aria-live={pending ? "polite" : "assertive"}
  >
    <div className="recovery-orbit" aria-hidden="true">
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
