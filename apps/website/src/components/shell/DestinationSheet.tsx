import { useCallback, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import styles from "./shell.module.css";

export type SheetSnap = "full" | "half" | "peek";

const SNAPS: readonly SheetSnap[] = ["peek", "half", "full"];
const SHEET_QUERY = "(max-width: 760px)";
const DRAG_THRESHOLD_PX = 6;
const FLING_MS = 140;

const nextSnap = (snap: SheetSnap): SheetSnap =>
  snap === "peek" ? "half" : snap === "half" ? "full" : "peek";

interface Drag {
  active: boolean;
  lastTime: number;
  lastY: number;
  pointerId: number;
  startHeight: number;
  startY: number;
  velocity: number;
}

/*
 * ONE MARKUP, TWO COMPOSITIONS
 *
 * On a wide screen the sheet is not there at all — it is `display: contents`, so the identity and
 * the panel inside it are placed on their own. On a phone it becomes a bottom sheet holding both:
 * it rests at a peek that shows the destination's name, opens to half the screen and to all of it,
 * and is dragged, flicked or tapped between them. Nothing is measured to decide which composition
 * applies, so it renders the same on a server and in a test.
 */
export const DestinationSheet = ({ children }: { children: ReactNode }) => {
  const [snap, setSnap] = useState<SheetSnap>("peek");
  const sheetRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);

  // The peek is however tall the destination's name runs, so it is measured from the content.
  useEffect(() => {
    const sheet = sheetRef.current;
    const scroller = scrollRef.current;
    if (!sheet || !scroller) return;
    const measure = (): void => {
      const end = scroller.querySelector<HTMLElement>("[data-sheet-peek-end]");
      if (!end) return;
      if (scroller.scrollTop !== 0) return;
      const peek = end.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top + 18;
      if (peek <= 0) return;
      sheet.style.setProperty("--sheet-peek", `${String(Math.round(peek))}px`);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (snap !== "full") scrollRef.current?.scrollTo({ top: 0 });
  }, [snap]);

  const heights = useCallback((): Record<SheetSnap, number> => {
    const sheet = sheetRef.current;
    const peek = sheet
      ? Number.parseFloat(sheet.style.getPropertyValue("--sheet-peek")) || 170
      : 170;
    const viewport = window.innerHeight;
    return { full: viewport - 72, half: viewport * 0.56, peek };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (!window.matchMedia(SHEET_QUERY).matches) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const target = event.target as HTMLElement;
    // Scrolling content takes the gesture once the sheet is fully open.
    if (snap === "full" && !target.closest("[data-sheet-grip]")) return;
    if (target.closest("input, select, textarea, [role='tablist'], [data-sheet-no-drag]")) return;
    const sheet = sheetRef.current;
    if (!sheet) return;
    drag.current = {
      active: false,
      lastTime: event.timeStamp,
      lastY: event.clientY,
      pointerId: event.pointerId,
      startHeight: sheet.getBoundingClientRect().height,
      startY: event.clientY,
      velocity: 0,
    };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    const sheet = sheetRef.current;
    if (!current || !sheet || current.pointerId !== event.pointerId) return;
    const distance = event.clientY - current.startY;
    if (!current.active) {
      if (Math.abs(distance) < DRAG_THRESHOLD_PX) return;
      current.active = true;
      sheet.setPointerCapture(event.pointerId);
      sheet.dataset.dragging = "true";
    }
    const elapsed = Math.max(event.timeStamp - current.lastTime, 1);
    current.velocity = (event.clientY - current.lastY) / elapsed;
    current.lastY = event.clientY;
    current.lastTime = event.timeStamp;
    const { full, peek } = heights();
    const height = Math.min(full, Math.max(peek * 0.85, current.startHeight - distance));
    sheet.style.height = `${String(height)}px`;
  };

  const onPointerEnd = (event: PointerEvent<HTMLDivElement>): void => {
    const current = drag.current;
    const sheet = sheetRef.current;
    drag.current = null;
    if (!current || !sheet || !current.active) return;
    // A drag that moved the sheet is not also a tap on whatever it started over.
    const swallowClick = (click: MouseEvent): void => {
      click.stopPropagation();
      click.preventDefault();
    };
    window.addEventListener("click", swallowClick, { capture: true, once: true });
    window.setTimeout(() => window.removeEventListener("click", swallowClick, true), 0);

    const projected = sheet.getBoundingClientRect().height - current.velocity * FLING_MS;
    const targets = heights();
    const nearest = SNAPS.reduce((best, candidate) =>
      Math.abs(targets[candidate] - projected) < Math.abs(targets[best] - projected)
        ? candidate
        : best,
    );
    if (sheet.hasPointerCapture(event.pointerId)) sheet.releasePointerCapture(event.pointerId);
    delete sheet.dataset.dragging;
    sheet.style.removeProperty("height");
    setSnap(nearest);
  };

  return (
    <div
      ref={sheetRef}
      className={styles["sheet"]}
      data-snap={snap}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <button
        className={styles["sheet-handle"]}
        data-testid="panel-disclosure"
        data-sheet-grip
        type="button"
        aria-expanded={snap !== "peek"}
        aria-label={snap === "full" ? "Hide destination readings" : "Show destination readings"}
        onClick={() => setSnap(nextSnap)}
      >
        <span aria-hidden="true" />
      </button>
      <div ref={scrollRef} className={styles["sheet-scroll"]}>
        {children}
      </div>
    </div>
  );
};
