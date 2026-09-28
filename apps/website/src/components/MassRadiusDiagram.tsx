import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { zengRockyRadius, type CompositionReading } from "../composition.ts";
import styles from "./SignalChart.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

const WIDTH = 260;
const HEIGHT = 170;
const MARGIN = { bottom: 18, left: 30, right: 10, top: 8 } as const;
const MASS_DOMAIN = [0.03, 5_000] as const;
const RADIUS_DOMAIN = [0.3, 25] as const;

// NASA planetary fact sheet, in Earth units.
const SOLAR_SYSTEM = [
  { label: "Me", labelAt: [0, -5, "middle"], mass: 0.0553, name: "Mercury", radius: 0.383 },
  { label: "Ma", labelAt: [0, -5, "middle"], mass: 0.107, name: "Mars", radius: 0.532 },
  { label: "V", labelAt: [-5, 2, "end"], mass: 0.815, name: "Venus", radius: 0.949 },
  { label: "E", labelAt: [0, -5, "middle"], mass: 1, name: "Earth", radius: 1 },
  { label: "U", labelAt: [-5, 2, "end"], mass: 14.5, name: "Uranus", radius: 4.01 },
  { label: "N", labelAt: [5, 2, "start"], mass: 17.1, name: "Neptune", radius: 3.88 },
  { label: "S", labelAt: [-5, 2, "end"], mass: 95.2, name: "Saturn", radius: 9.45 },
  { label: "J", labelAt: [5, 2, "start"], mass: 317.8, name: "Jupiter", radius: 11.21 },
] as const;

const COMPOSITION_CURVES = [
  { coreMassFraction: 0, label: "rock", labelDy: -3 },
  { coreMassFraction: 0.33, label: "Earth-like", labelDy: 7 },
] as const;

const logScale = (value: number, [low, high]: readonly [number, number], span: number): number =>
  ((Math.log10(value) - Math.log10(low)) / (Math.log10(high) - Math.log10(low))) * span;

const x = (mass: number): number =>
  MARGIN.left + logScale(mass, MASS_DOMAIN, WIDTH - MARGIN.left - MARGIN.right);
const y = (radius: number): number =>
  HEIGHT - MARGIN.bottom - logScale(radius, RADIUS_DOMAIN, HEIGHT - MARGIN.top - MARGIN.bottom);

const clampTo = (value: number, [low, high]: readonly [number, number]): number =>
  Math.min(Math.max(value, low), high);

const figures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });

interface Point {
  mass: number;
  name: string;
  radius: number;
  subject: boolean;
}

/*
 * Mass against radius on log axes, the plane every exoplanet composition argument is drawn on.
 * The Solar System's eight planets anchor it; the rocky composition curves are drawn only over
 * the 1–8 Earth masses their fit covers. A minimum mass carries an arrow toward heavier, and an
 * estimated radius is drawn hollow, so the dot never claims more than the archive measured.
 */
export const MassRadiusDiagram = ({
  name,
  reading,
}: {
  name: string;
  reading: CompositionReading;
}) => {
  const [active, setActive] = useState<number | null>(null);
  const titleId = useId();
  const points: readonly Point[] = [
    ...SOLAR_SYSTEM.map((planet) => ({ ...planet, subject: false })),
    { mass: reading.massEarth, name, radius: reading.radiusEarth, subject: true },
  ];
  const subject = points.at(-1)!;
  const subjectX = x(clampTo(subject.mass, MASS_DOMAIN));
  const subjectY = y(clampTo(subject.radius, RADIUS_DOMAIN));

  const onPointerMove = (event: PointerEvent<SVGSVGElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const px = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const py = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    let best = 0;
    let bestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = Math.hypot(
        x(clampTo(point.mass, MASS_DOMAIN)) - px,
        y(clampTo(point.radius, RADIUS_DOMAIN)) - py,
      );
      if (distance < bestDistance) {
        best = index;
        bestDistance = distance;
      }
    });
    setActive(bestDistance < 24 ? best : null);
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>): void => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const from = active ?? points.length - 1;
    const step = event.key === "ArrowRight" ? 1 : -1;
    setActive((from + step + points.length) % points.length);
  };

  const activePoint = active === null ? null : points[active];
  const describe = (point: Point): string =>
    `${point.name} · ${point.subject && reading.massLowerBound ? "≥" : ""}${figures.format(point.mass)} M⊕ · ${point.subject && reading.radiusEstimated ? "~" : ""}${figures.format(point.radius)} R⊕`;

  return (
    <figure className={cx("chart")} data-tone="gold">
      <figcaption className={cx("chart-title")} id={titleId}>
        Mass against radius · Earth units · log scales
      </figcaption>
      <div className={cx("chart-frame")}>
        <svg
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          role="img"
          aria-labelledby={titleId}
          tabIndex={0}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
          onPointerLeave={() => setActive(null)}
          onPointerMove={onPointerMove}
        >
          {[0.1, 1, 10, 100, 1_000].map((mass) => (
            <g key={`mass-${String(mass)}`}>
              <line
                className={cx("chart-grid")}
                x1={x(mass)}
                x2={x(mass)}
                y1={MARGIN.top}
                y2={HEIGHT - MARGIN.bottom}
              />
              <text className={cx("chart-tick")} x={x(mass)} y={HEIGHT - 5} textAnchor="middle">
                {mass.toLocaleString("en")}
              </text>
            </g>
          ))}
          {[0.5, 1, 2, 5, 10, 20].map((radius) => (
            <g key={`radius-${String(radius)}`}>
              <line
                className={cx("chart-grid")}
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={y(radius)}
                y2={y(radius)}
              />
              <text
                className={cx("chart-tick")}
                x={MARGIN.left - 4}
                y={y(radius) + 2.5}
                textAnchor="end"
              >
                {String(radius)}
              </text>
            </g>
          ))}
          {COMPOSITION_CURVES.map((curve) => {
            const masses = Array.from({ length: 24 }, (_, index) => 1 + (7 * index) / 23);
            const d = masses
              .map(
                (mass, index) =>
                  `${index === 0 ? "M" : "L"}${x(mass).toFixed(2)},${y(zengRockyRadius(mass, curve.coreMassFraction)).toFixed(2)}`,
              )
              .join("");
            return (
              <g key={curve.label}>
                <path className={cx("chart-model")} d={d} />
                <text
                  className={cx("chart-annotation")}
                  x={x(8) + 3}
                  y={y(zengRockyRadius(8, curve.coreMassFraction)) + curve.labelDy}
                >
                  {curve.label}
                </text>
              </g>
            );
          })}
          {SOLAR_SYSTEM.map((planet) => (
            <g key={planet.name}>
              <circle
                className={cx("chart-reference")}
                cx={x(planet.mass)}
                cy={y(planet.radius)}
                r={3}
              />
              <text
                className={cx("chart-annotation")}
                x={x(planet.mass) + planet.labelAt[0]}
                y={y(planet.radius) + planet.labelAt[1]}
                textAnchor={planet.labelAt[2]}
              >
                {planet.label}
              </text>
            </g>
          ))}
          {reading.massLowerBound ? (
            <path
              className={cx("chart-bound")}
              d={`M${String(subjectX + 6)},${String(subjectY)}h14m-4,-3l4,3l-4,3`}
            />
          ) : null}
          <circle
            className={cx(reading.radiusEstimated ? "chart-subject estimated" : "chart-subject")}
            cx={subjectX}
            cy={subjectY}
            r={4.5}
          />
          {activePoint ? (
            <circle
              className={cx("chart-focus")}
              cx={x(clampTo(activePoint.mass, MASS_DOMAIN))}
              cy={y(clampTo(activePoint.radius, RADIUS_DOMAIN))}
              r={7}
            />
          ) : null}
        </svg>
        <p className={cx("chart-readout")} aria-live="polite">
          {activePoint ? (
            <strong>{describe(activePoint)}</strong>
          ) : (
            <span>
              {reading.massLowerBound
                ? "Arrow: only a minimum mass is known"
                : reading.radiusEstimated
                  ? "Hollow: the radius is the archive's estimate"
                  : "Hover or use the arrow keys to compare"}
            </span>
          )}
        </p>
      </div>
      <table className={cx("visually-hidden")}>
        <caption>Mass and radius compared with the Solar System, in Earth units</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.name}>
              <th scope="row">{point.name}</th>
              <td>{describe(point)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};
