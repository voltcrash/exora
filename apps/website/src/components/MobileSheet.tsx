import { useEffect, useRef, type ReactNode } from "react";
import sharedStyles from "./ExperienceShared.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles);

interface MobileSheetProps {
  children: ReactNode;
  eyebrow: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

export const MobileSheet = ({ children, eyebrow, onClose, open, title }: MobileSheetProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      className={cx("mobile-sheet")}
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <section>
        <header>
          <span>
            <small>{eyebrow}</small>
            <h2>{title}</h2>
          </span>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
            ×
          </button>
        </header>
        <div className={cx("mobile-sheet-body")} data-testid="mobile-sheet-body">
          {children}
        </div>
      </section>
    </dialog>
  );
};
