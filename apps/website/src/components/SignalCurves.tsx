import type { TransitSignal, VelocitySignal } from "../detection-signal.ts";
import {
  drawsCircularVelocity,
  niceStep,
  transitCurve,
  velocityCurve,
  type TransitCurve,
} from "../signal-curves.ts";
import { SignalChart, type ChartTick } from "./SignalChart.tsx";

const threeFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 3 });
const twoFigures = new Intl.NumberFormat("en", { maximumSignificantDigits: 2 });

const signed = (value: number, text: string): string =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${text}`;

const symmetricTicks = (limit: number, format: (value: number) => string): ChartTick[] => {
  const step = niceStep(limit, 1);
  const ticks: ChartTick[] = [];
  for (let value = -Math.floor(limit / step) * step; value <= limit + 1e-9; value += step) {
    ticks.push({ label: format(value), value });
  }
  return ticks;
};

const hoursLabel = (hours: number, minutes: boolean): string =>
  minutes
    ? `${String(Math.round(Math.abs(hours) * 60))}m`
    : `${twoFigures.format(Math.abs(hours))}h`;

const TransitChart = ({ curve }: { curve: TransitCurve }) => {
  const minutes = curve.windowHours < 2;
  const depthPercent = curve.depth * 100;
  const step = niceStep(depthPercent);
  const yTicks: ChartTick[] = [];
  for (let dip = 0; dip <= depthPercent + 1e-9; dip += step) {
    yTicks.push({ label: dip === 0 ? "0" : `−${twoFigures.format(dip)}%`, value: 1 - dip / 100 });
  }
  const contactSpan = hoursLabel(curve.contactHours * 2, minutes);

  return (
    <SignalChart
      description={`Starlight against time through one transit. The dip bottoms out ${threeFigures.format(depthPercent)} percent below the star's normal brightness and lasts ${contactSpan} from first to last contact.${curve.assumedCentral ? " The chord's position is unknown, so a central crossing is drawn." : ""}`}
      formatX={(hours) => `${signed(hours, hoursLabel(hours, minutes))} from mid-transit`}
      formatY={(flux) => `${threeFigures.format(Math.max(1 - flux, 0) * 1e6)} ppm dip`}
      markers={[
        { label: "First contact", value: -curve.contactHours },
        { label: "Last contact", value: curve.contactHours },
      ]}
      points={curve.points}
      summary={[
        { label: "Depth", value: `${threeFigures.format(depthPercent)} %` },
        { label: "First to last contact", value: contactSpan },
        { label: "Limb darkening", value: "Quadratic, Sun-like coefficients assumed" },
      ]}
      title={`Light curve · limb-darkened${curve.assumedCentral ? " · central chord assumed" : ""}`}
      tone="cyan"
      xDomain={[-curve.windowHours, curve.windowHours]}
      xTicks={symmetricTicks(curve.windowHours * 0.95, (hours) =>
        signed(hours, hoursLabel(hours, minutes)),
      )}
      yDomain={[1 - curve.depth * 1.18, 1 + curve.depth * 0.12]}
      yTicks={yTicks}
    />
  );
};

const VelocityChart = ({
  periodDays,
  velocity,
}: {
  periodDays: number | null;
  velocity: VelocitySignal;
}) => {
  const amplitude = velocity.amplitudeMetersPerSecond;
  const phaseLabel = (phase: number): string =>
    periodDays === null
      ? `${twoFigures.format(phase)} orbit`
      : `${threeFigures.format(phase * periodDays)} d`;

  return (
    <SignalChart
      description={`The star's speed toward and away from Earth over one orbit, swinging ${threeFigures.format(amplitude)} metres per second either side of rest${velocity.lowerBound ? " at least, since only the minimum mass is known" : ""}. The orbit is drawn circular.`}
      formatX={(phase) => `${phaseLabel(phase)} after transit`}
      formatY={(speed) =>
        Math.abs(speed) < amplitude * 0.005
          ? "at rest"
          : `${threeFigures.format(Math.abs(speed))} m/s ${speed > 0 ? "away" : "toward us"}`
      }
      points={velocityCurve(velocity)}
      summary={[
        {
          label: "Semi-amplitude",
          value: `${velocity.lowerBound ? "at least " : ""}${threeFigures.format(amplitude)} m/s`,
        },
        ...(periodDays === null
          ? []
          : [
              {
                label: "Fastest approach",
                value: `${threeFigures.format(periodDays / 4)} days after transit`,
              },
            ]),
      ]}
      title={`Velocity curve · ${velocity.source === "measured" ? "measured" : "derived"} K${velocity.lowerBound ? " (minimum)" : ""} · circular orbit`}
      tone="gold"
      xDomain={[0, 1]}
      xTicks={[0, 0.25, 0.5, 0.75, 1].map((phase) => ({ label: phaseLabel(phase), value: phase }))}
      yDomain={[-amplitude * 1.25, amplitude * 1.25]}
      yTicks={symmetricTicks(amplitude, (speed) =>
        signed(speed, twoFigures.format(Math.abs(speed))),
      )}
    />
  );
};

interface SignalCurvesProps {
  eccentricity: number | null;
  periodDays: number | null;
  transit: TransitSignal | null;
  velocity: VelocitySignal | null;
}

/** The transit and the velocity wobble drawn as the curves an instrument would record. */
export const SignalCurves = ({
  eccentricity,
  periodDays,
  transit,
  velocity,
}: SignalCurvesProps) => {
  const curve = transit ? transitCurve(transit) : null;
  const drawnVelocity = velocity && drawsCircularVelocity(eccentricity) ? velocity : null;
  if (!curve && !drawnVelocity) return null;

  return (
    <>
      {curve ? <TransitChart curve={curve} /> : null}
      {drawnVelocity ? <VelocityChart periodDays={periodDays} velocity={drawnVelocity} /> : null}
    </>
  );
};
