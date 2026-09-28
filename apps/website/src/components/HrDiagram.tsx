import { useEffect, useId, useRef, useState, type PointerEvent } from "react";
import {
  HR_MAGNITUDE_DOMAIN,
  HR_TEMPERATURE_DOMAIN,
  hrPopulation,
  hrPosition,
  hrRegion,
  SUN,
  type HrPoint,
  type HrPopulation,
} from "../hr-diagram.ts";
import { loadSkyCatalog } from "../sky-catalog.ts";
import styles from "./HrDiagram.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(styles);

const WIDTH = 260;
const HEIGHT = 190;
const MARGIN = { bottom: 18, left: 26, right: 8, top: 8 } as const;
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const TEMPERATURE_TICKS = [30_000, 10_000, 6_000, 4_000, 3_000] as const;
const MAGNITUDE_TICKS = [-5, 0, 5, 10, 15] as const;
const REGION_LABELS = [
  { at: { absoluteMagnitude: 7.5, temperatureKelvin: 12_000 }, label: "main sequence" },
  { at: { absoluteMagnitude: -2.4, temperatureKelvin: 3_300 }, label: "giants" },
  { at: { absoluteMagnitude: -7.8, temperatureKelvin: 6_500 }, label: "supergiants" },
] as const;

const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});

const toPlot = ([x, y]: readonly [number, number]): readonly [number, number] => [
  MARGIN.left + x * PLOT_WIDTH,
  MARGIN.top + (1 - y) * PLOT_HEIGHT,
];

const fromPlot = (x: number, y: number): HrPoint => {
  const [coolest, hottest] = HR_TEMPERATURE_DOMAIN;
  const [brightest, faintest] = HR_MAGNITUDE_DOMAIN;
  const unitX = (x - MARGIN.left) / PLOT_WIDTH;
  const unitY = 1 - (y - MARGIN.top) / PLOT_HEIGHT;
  return {
    absoluteMagnitude: faintest - unitY * (faintest - brightest),
    temperatureKelvin:
      10 ** (Math.log10(hottest) - unitX * (Math.log10(hottest) - Math.log10(coolest))),
  };
};

const describe = (point: HrPoint): string =>
  `${whole.format(point.temperatureKelvin)} K · M ${oneDecimal.format(point.absoluteMagnitude)}`;

let populationRequest: Promise<HrPopulation | null> | null = null;
const naturalSky = (): Promise<HrPopulation | null> => {
  populationRequest ??= loadSkyCatalog().then((catalog) =>
    catalog ? hrPopulation(catalog) : null,
  );
  return populationRequest;
};

/*
 * The star against every naked-eye star with a parallax, on the diagram that sorts stars by what
 * they are doing: burning hydrogen on the main sequence, swollen into giants, or collapsed into
 * white dwarfs. The population is coloured by its own temperature; the Sun is ringed for scale.
 */
export const HrDiagram = ({ name, subject }: { name: string; subject: HrPoint }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [population, setPopulation] = useState<HrPopulation | null>(null);
  const [pointer, setPointer] = useState<HrPoint | null>(null);
  const titleId = useId();

  useEffect(() => {
    let active = true;
    void naturalSky().then((loaded) => {
      if (active) setPopulation(loaded);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !population) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2) * 2;
    canvas.width = WIDTH * ratio;
    canvas.height = HEIGHT * ratio;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, WIDTH, HEIGHT);
    context.globalAlpha = 0.55;
    for (let index = 0; index < population.count; index += 1) {
      const [x, y] = toPlot([
        population.positions[index * 2] ?? 0,
        population.positions[index * 2 + 1] ?? 0,
      ]);
      const red = Math.round((population.colors[index * 3] ?? 1) * 255);
      const green = Math.round((population.colors[index * 3 + 1] ?? 1) * 255);
      const blue = Math.round((population.colors[index * 3 + 2] ?? 1) * 255);
      context.fillStyle = `rgb(${String(red)} ${String(green)} ${String(blue)})`;
      context.fillRect(x - 0.6, y - 0.6, 1.2, 1.2);
    }
    context.globalAlpha = 1;
  }, [population]);

  const subjectPosition = hrPosition(subject);
  const sunPosition = hrPosition(SUN);
  const [subjectX, subjectY] = subjectPosition ? toPlot(subjectPosition) : [0, 0];
  const [sunX, sunY] = sunPosition ? toPlot(sunPosition) : [0, 0];
  const isSun = subject === SUN;

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * WIDTH;
    const y = ((event.clientY - bounds.top) / bounds.height) * HEIGHT;
    const inside =
      x >= MARGIN.left &&
      x <= WIDTH - MARGIN.right &&
      y >= MARGIN.top &&
      y <= HEIGHT - MARGIN.bottom;
    setPointer(inside ? fromPlot(x, y) : null);
  };

  return (
    <figure className={cx("hr")}>
      <figcaption className={cx("hr-title")} id={titleId}>
        Hertzsprung–Russell · {population ? whole.format(population.count) : "…"} naked-eye stars
      </figcaption>
      <div
        className={cx("hr-frame")}
        onPointerLeave={() => setPointer(null)}
        onPointerMove={onPointerMove}
      >
        <canvas
          ref={canvasRef}
          className={cx("hr-canvas")}
          role="img"
          aria-labelledby={titleId}
          aria-describedby={`${titleId}-summary`}
        />
        <svg
          className={cx("hr-axes")}
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          aria-hidden="true"
        >
          {TEMPERATURE_TICKS.map((temperature) => {
            const position = hrPosition({ absoluteMagnitude: 0, temperatureKelvin: temperature });
            if (!position) return null;
            const [x] = toPlot(position);
            return (
              <g key={`t-${String(temperature)}`}>
                <line
                  className={cx("hr-grid")}
                  x1={x}
                  x2={x}
                  y1={MARGIN.top}
                  y2={HEIGHT - MARGIN.bottom}
                />
                <text className={cx("hr-tick")} x={x} y={HEIGHT - 6} textAnchor="middle">
                  {temperature >= 10_000
                    ? `${String(temperature / 1_000)}k`
                    : whole.format(temperature)}
                </text>
              </g>
            );
          })}
          {MAGNITUDE_TICKS.map((magnitude) => {
            const position = hrPosition({ absoluteMagnitude: magnitude, temperatureKelvin: 6_000 });
            if (!position) return null;
            const [, y] = toPlot(position);
            return (
              <g key={`m-${String(magnitude)}`}>
                <line
                  className={cx("hr-grid")}
                  x1={MARGIN.left}
                  x2={WIDTH - MARGIN.right}
                  y1={y}
                  y2={y}
                />
                <text className={cx("hr-tick")} x={MARGIN.left - 4} y={y + 2.5} textAnchor="end">
                  {magnitude > 0 ? `+${String(magnitude)}` : String(magnitude)}
                </text>
              </g>
            );
          })}
          {REGION_LABELS.map((region) => {
            const position = hrPosition(region.at);
            if (!position) return null;
            const [x, y] = toPlot(position);
            return (
              <text key={region.label} className={cx("hr-region")} x={x} y={y} textAnchor="middle">
                {region.label}
              </text>
            );
          })}
          {sunPosition && !isSun ? (
            <g>
              <circle className={cx("hr-sun")} cx={sunX} cy={sunY} r={3.5} />
              <text className={cx("hr-label")} x={sunX + 6} y={sunY + 3}>
                Sun
              </text>
            </g>
          ) : null}
          {subjectPosition ? (
            <g>
              <circle className={cx("hr-subject")} cx={subjectX} cy={subjectY} r={5} />
              <text
                className={cx("hr-label strong")}
                x={subjectX + (subjectX > WIDTH * 0.7 ? -8 : 8)}
                y={subjectY - 6}
                textAnchor={subjectX > WIDTH * 0.7 ? "end" : "start"}
              >
                {name}
              </text>
            </g>
          ) : null}
        </svg>
      </div>
      <p className={cx("hr-readout")} aria-live="polite">
        {pointer ? (
          <span>
            {describe(pointer)} · {hrRegion(pointer)}
          </span>
        ) : (
          <strong>
            {name} · {describe(subject)} · {hrRegion(subject)}
          </strong>
        )}
      </p>
      <p className={cx("visually-hidden")} id={`${titleId}-summary`}>
        {name} has a temperature of {whole.format(subject.temperatureKelvin)} kelvin and an absolute
        visual magnitude of {oneDecimal.format(subject.absoluteMagnitude)}, which places it{" "}
        {hrRegion(subject)}. The Sun is 5,772 kelvin at magnitude 4.8.
      </p>
    </figure>
  );
};
