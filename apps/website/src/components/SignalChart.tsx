import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { CurvePoint } from "../signal-curves.ts";
import styles from "./SignalChart.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

const WIDTH = 260;
const HEIGHT = 118;
const MARGIN = { bottom: 18, left: 36, right: 8, top: 10 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;

export interface ChartTick {
  label: string;
  value: number;
}

export interface ChartMarker {
  label: string;
  value: number;
}

interface SignalChartProps {
  /** Describes the whole figure for assistive technology. */
  description: string;
  formatX: (x: number) => string;
  formatY: (y: number) => string;
  /** Vertical hairlines at meaningful x positions, such as first and last contact. */
  markers?: readonly ChartMarker[];
  points: readonly CurvePoint[];
  /** Rows of the table twin: the values a reader would otherwise have to hover for. */
  summary: readonly { label: string; value: string }[];
  title: string;
  tone: "cyan" | "gold";
  xDomain: readonly [number, number];
  xTicks: readonly ChartTick[];
  yDomain: readonly [number, number];
  yTicks: readonly ChartTick[];
}

/*
 * One series on one axis. The line is the only loud mark; the grid is a hairline one step off the
 * panel and the axes carry clean round ticks. A crosshair snaps to the nearest sample under the
 * pointer, the arrow keys walk the same readout, and every number worth reading is repeated in a
 * table so the figure never gates a value behind a hover.
 */
export const SignalChart = ({
  description,
  formatX,
  formatY,
  markers = [],
  points,
  summary,
  title,
  tone,
  xDomain,
  xTicks,
  yDomain,
  yTicks,
}: SignalChartProps) => {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const scaleX = (x: number): number =>
    MARGIN.left + ((x - xDomain[0]) / (xDomain[1] - xDomain[0])) * PLOT_WIDTH;
  const scaleY = (y: number): number =>
    MARGIN.top + (1 - (y - yDomain[0]) / (yDomain[1] - yDomain[0])) * PLOT_HEIGHT;
  const path = points
    .map(
      (point, index) =>
        `${index === 0 ? "M" : "L"}${scaleX(point.x).toFixed(2)},${scaleY(point.y).toFixed(2)}`,
    )
    .join("");

  const nearest = (clientX: number, bounds: DOMRect): number => {
    const x = ((clientX - bounds.left) / bounds.width) * WIDTH;
    let best = 0;
    points.forEach((point, index) => {
      if (Math.abs(scaleX(point.x) - x) < Math.abs(scaleX(points[best]!.x) - x)) best = index;
    });
    return best;
  };

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()));
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    const step = Math.max(1, Math.round(points.length / 40));
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const from = active ?? Math.floor(points.length / 2);
      const delta = event.key === "ArrowRight" ? step : -step;
      setActive(Math.min(points.length - 1, Math.max(0, from + delta)));
    } else if (event.key === "Escape") {
      setActive(null);
    }
  };

  const activePoint = active === null ? null : points[active];

  return (
    <figure className={cx("chart")} data-tone={tone}>
      <figcaption className={cx("chart-title")} id={titleId}>
        {title}
      </figcaption>
      <div className={cx("chart-frame")}>
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={descriptionId}
          tabIndex={0}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setActive(null)}
          onPointerMove={onPointerMove}
        >
          {yTicks.map((tick) => (
            <g key={`y-${tick.label}`}>
              <line
                className={cx("chart-grid")}
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={scaleY(tick.value)}
                y2={scaleY(tick.value)}
              />
              <text
                className={cx("chart-tick")}
                x={MARGIN.left - 5}
                y={scaleY(tick.value) + 2.5}
                textAnchor="end"
              >
                {tick.label}
              </text>
            </g>
          ))}
          {xTicks.map((tick) => (
            <text
              key={`x-${tick.label}`}
              className={cx("chart-tick")}
              x={scaleX(tick.value)}
              y={HEIGHT - 5}
              textAnchor="middle"
            >
              {tick.label}
            </text>
          ))}
          {markers.map((marker) => (
            <line
              key={`marker-${marker.label}`}
              className={cx("chart-marker")}
              x1={scaleX(marker.value)}
              x2={scaleX(marker.value)}
              y1={MARGIN.top}
              y2={HEIGHT - MARGIN.bottom}
            >
              <title>{marker.label}</title>
            </line>
          ))}
          <path className={cx("chart-line")} d={path} />
          {activePoint ? (
            <g>
              <line
                className={cx("chart-crosshair")}
                x1={scaleX(activePoint.x)}
                x2={scaleX(activePoint.x)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
              />
              <circle
                className={cx("chart-dot")}
                cx={scaleX(activePoint.x)}
                cy={scaleY(activePoint.y)}
                r={4}
              />
            </g>
          ) : null}
        </svg>
        <p className={cx("chart-readout")} aria-live="polite">
          {activePoint ? (
            <>
              <strong>{formatY(activePoint.y)}</strong>
              <span>{formatX(activePoint.x)}</span>
            </>
          ) : (
            <span>Hover or use the arrow keys to read the curve</span>
          )}
        </p>
      </div>
      <p className={cx("visually-hidden")} id={descriptionId}>
        {description}
      </p>
      <table className={cx("visually-hidden")}>
        <caption>{title}</caption>
        <tbody>
          {summary.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              <td>{row.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
