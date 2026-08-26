import { useEffect, useRef, type ReactNode } from "react";

interface MobileSheetProps {
  children: ReactNode;
  eyebrow: string;
  onClose: () => void;
  open: boolean;
  title: string;
}

/** A phone-only top-layer surface for controls that would otherwise cover the scene. */
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
      className="mobile-sheet"
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
        <div className="mobile-sheet-body">{children}</div>
      </section>
    </dialog>
  );
};
