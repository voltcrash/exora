import {
  generateCustomBlackHole,
  generateCustomStar,
  generateCustomWorld,
  type CustomBlackHole,
  type CustomBlackHoleParameters,
  type CustomPlanetParameters,
  type CustomStar,
  type CustomStarParameters,
  type CustomWorld,
  type Rgb,
} from "@exora/worldgen";
import { useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTabList } from "../use-tab-list.ts";
import {
  BlackHoleCatalogVisual,
  PlanetCatalogVisual,
  StarCatalogVisual,
} from "./CatalogVisual.tsx";
import { Button } from "./ui/Button.tsx";
import { TabBar } from "./ui/TabBar.tsx";
import styles from "./CustomPlanetBuilder.module.css";

export type ForgeMode = "black-hole" | "planet" | "star";

const FORGE_MODES: readonly ForgeMode[] = ["planet", "star", "black-hole"];

interface WorldForgeProps {
  initialMode: ForgeMode;
  onGenerateBlackHole: (blackHole: CustomBlackHole) => void;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
}

const initialParameters: CustomPlanetParameters = {
  activity: 0.64,
  atmosphere: 0.58,
  axialTilt: 0.56,
  baseColor: [0.12, 0.54, 0.68],
  kind: "rocky",
  name: "Asteria",
  radius: 0.52,
  rings: false,
  rotation: 0.46,
  seed: 7319,
  temperatureKelvin: 286,
  water: 0.56,
};

const initialStarParameters: CustomStarParameters = {
  activity: 0.68,
  kind: "main-sequence",
  name: "Solara",
  radius: 0.55,
  rotation: 0.42,
  seed: 42_017,
  temperatureKelvin: 5_772,
};

const initialBlackHoleParameters: CustomBlackHoleParameters = {
  diskActivity: 0.72,
  diskHueDegrees: 28,
  diskTiltDegrees: 62,
  jetStrength: 0.46,
  kind: "supermassive",
  mass: 0.48,
  name: "Nyx",
  seed: 88_021,
};

const BLACK_HOLE_MASS_RANGES: Record<CustomBlackHoleParameters["kind"], readonly [number, number]> =
  {
    "stellar-mass": [3, 100],
    "intermediate-mass": [100, 100_000],
    supermassive: [100_000, 10_000_000_000],
    ultramassive: [10_000_000_000, 100_000_000_000],
  };

const toHex = (color: Rgb): string =>
  `#${color
    .map((channel) =>
      Math.round(channel * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;

const fromHex = (hex: string): Rgb => [
  Number.parseInt(hex.slice(1, 3), 16) / 255,
  Number.parseInt(hex.slice(3, 5), 16) / 255,
  Number.parseInt(hex.slice(5, 7), 16) / 255,
];

const percentage = (value: number): string => `${Math.round(value * 100)}%`;

interface RangeControlProps {
  label: string;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
  valueLabel: string;
}

const RangeControl = ({
  label,
  max = 1,
  min = 0,
  onChange,
  step = 0.01,
  value,
  valueLabel,
}: RangeControlProps) => (
  <label className={styles["range"]}>
    <span className={styles["range-head"]}>
      {label}
      <output>{valueLabel}</output>
    </span>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(event) => onChange(event.currentTarget.valueAsNumber)}
    />
  </label>
);

const Field = ({ children, label }: { children: ReactNode; label: string }) => (
  <label className={styles["field"]}>
    <span>{label}</span>
    {children}
  </label>
);

const SeedField = ({ onChange, value }: { onChange: (seed: number) => void; value: number }) => (
  <div className={styles["field"]}>
    <label htmlFor="forge-seed">Seed</label>
    <span className={styles["seed"]}>
      <input
        id="forge-seed"
        type="number"
        min={0}
        max={999999}
        value={value}
        onChange={(event) => onChange(event.currentTarget.valueAsNumber || 0)}
      />
      <Button
        size="sm"
        icon="dice"
        variant="ghost"
        aria-label="Random seed"
        title="Random seed"
        onClick={() => onChange(Math.floor(Math.random() * 1_000_000))}
      />
    </span>
  </div>
);

const spectralClass = (temperatureKelvin: number): string => {
  if (temperatureKelvin >= 30_000) return "Class O · blue";
  if (temperatureKelvin >= 10_000) return "Class B · blue-white";
  if (temperatureKelvin >= 7_500) return "Class A · white";
  if (temperatureKelvin >= 6_000) return "Class F · yellow-white";
  if (temperatureKelvin >= 5_200) return "Class G · yellow";
  if (temperatureKelvin >= 3_700) return "Class K · orange";
  return "Class M · red";
};

const blackHoleMass = ({ kind, mass }: CustomBlackHoleParameters): number => {
  const [minimum, maximum] = BLACK_HOLE_MASS_RANGES[kind];
  return 10 ** (Math.log10(minimum) + mass * (Math.log10(maximum) - Math.log10(minimum)));
};

const blackHoleMassLabel = (parameters: CustomBlackHoleParameters): string => {
  const mass = blackHoleMass(parameters);
  if (mass >= 1_000_000_000) return `${(mass / 1_000_000_000).toFixed(1)} billion M☉`;
  if (mass >= 1_000_000) return `${(mass / 1_000_000).toFixed(1)} million M☉`;
  return `${Math.round(mass).toLocaleString()} M☉`;
};

export const WorldForge = ({
  initialMode,
  onGenerateBlackHole,
  onGeneratePlanet,
  onGenerateStar,
}: WorldForgeProps) => {
  const nameRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ForgeMode>(initialMode);
  const [parameters, setParameters] = useState(initialParameters);
  const [starParameters, setStarParameters] = useState(initialStarParameters);
  const [blackHoleParameters, setBlackHoleParameters] = useState(initialBlackHoleParameters);

  useEffect(() => {
    const focusName = window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(focusName);
  }, []);

  const update = <Key extends keyof CustomPlanetParameters>(
    key: Key,
    value: CustomPlanetParameters[Key],
  ): void => setParameters((current) => ({ ...current, [key]: value }));

  const updateStar = <Key extends keyof CustomStarParameters>(
    key: Key,
    value: CustomStarParameters[Key],
  ): void => setStarParameters((current) => ({ ...current, [key]: value }));

  const updateBlackHole = <Key extends keyof CustomBlackHoleParameters>(
    key: Key,
    value: CustomBlackHoleParameters[Key],
  ): void => setBlackHoleParameters((current) => ({ ...current, [key]: value }));

  const tabs = useTabList({
    label: "Object type",
    list: "forge-mode",
    onSelect: setMode,
    value: mode,
    values: FORGE_MODES,
  });

  // The preview is drawn from the same generator the button runs, a frame behind the sliders.
  const draftWorld = useDeferredValue(parameters);
  const draftStar = useDeferredValue(starParameters);
  const draftBlackHole = useDeferredValue(blackHoleParameters);
  const preview = useMemo(() => {
    if (mode === "planet") {
      const world = generateCustomWorld(draftWorld);
      return <PlanetCatalogVisual planet={world.planet} recipe={world.recipe} />;
    }
    if (mode === "star") return <StarCatalogVisual star={generateCustomStar(draftStar).star} />;
    return <BlackHoleCatalogVisual blackHole={generateCustomBlackHole(draftBlackHole).blackHole} />;
  }, [draftBlackHole, draftStar, draftWorld, mode]);

  const radiusLabel =
    parameters.kind === "rocky"
      ? `${(0.45 + parameters.radius * 1.65).toFixed(2)} R⊕`
      : parameters.kind === "ice-giant"
        ? `${(2.1 + parameters.radius * 4.2).toFixed(1)} R⊕`
        : `${(0.72 + parameters.radius * 1.18).toFixed(2)} RJ`;

  const previewCaption =
    mode === "planet"
      ? `${parameters.name || "Untitled world"} · ${radiusLabel} · ${String(parameters.temperatureKelvin)} K`
      : mode === "star"
        ? `${starParameters.name || "Untitled star"} · ${spectralClass(starParameters.temperatureKelvin)}`
        : `${blackHoleParameters.name || "Untitled horizon"} · ${blackHoleMassLabel(blackHoleParameters)}`;

  return (
    <section className={styles["forge"]} data-testid="planet-builder" aria-label="World Forge">
      <div data-style-role="forge-tabs">
        <TabBar
          api={tabs}
          items={[
            { id: "planet", label: "Planet" },
            { id: "star", label: "Star" },
            { id: "black-hole", label: "Black hole" },
          ]}
          onSelect={setMode}
          variant="pill"
        />
      </div>

      <form
        className={styles["form"]}
        data-testid="planet-builder-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "planet") onGeneratePlanet(generateCustomWorld(parameters));
          else if (mode === "star") onGenerateStar(generateCustomStar(starParameters));
          else onGenerateBlackHole(generateCustomBlackHole(blackHoleParameters));
        }}
      >
        <div className={styles["body"]} data-style-role="builder-body" {...tabs.panelProps(mode)}>
          <figure className={styles["preview"]}>
            <div className={styles["preview-visual"]}>{preview}</div>
            <figcaption>{previewCaption}</figcaption>
          </figure>

          {mode === "planet" ? (
            <div className={styles["controls"]}>
              <fieldset className={styles["group"]}>
                <legend>Identity</legend>
                <Field label="Name">
                  <input
                    ref={nameRef}
                    type="text"
                    maxLength={32}
                    value={parameters.name}
                    onChange={(event) => update("name", event.currentTarget.value)}
                  />
                </Field>
                <Field label="Kind of world">
                  <select
                    value={parameters.kind}
                    onChange={(event) =>
                      update("kind", event.currentTarget.value as CustomPlanetParameters["kind"])
                    }
                  >
                    <option value="rocky">Rocky world</option>
                    <option value="ice-giant">Ice giant</option>
                    <option value="gas-giant">Gas giant</option>
                  </select>
                </Field>
                <Field label="Base colour">
                  <span className={styles["colour"]}>
                    <input
                      type="color"
                      value={toHex(parameters.baseColor)}
                      onChange={(event) => update("baseColor", fromHex(event.currentTarget.value))}
                    />
                    <output>{toHex(parameters.baseColor).toUpperCase()}</output>
                  </span>
                </Field>
                <SeedField value={parameters.seed} onChange={(seed) => update("seed", seed)} />
              </fieldset>

              <fieldset className={styles["group"]}>
                <legend>Physics</legend>
                <RangeControl
                  label="Size"
                  value={parameters.radius}
                  valueLabel={radiusLabel}
                  onChange={(value) => update("radius", value)}
                />
                <RangeControl
                  label="Temperature"
                  min={60}
                  max={2400}
                  step={5}
                  value={parameters.temperatureKelvin}
                  valueLabel={`${parameters.temperatureKelvin} K`}
                  onChange={(value) => update("temperatureKelvin", value)}
                />
                <RangeControl
                  label={parameters.kind === "rocky" ? "Terrain activity" : "Storm activity"}
                  value={parameters.activity}
                  valueLabel={percentage(parameters.activity)}
                  onChange={(value) => update("activity", value)}
                />
                <RangeControl
                  label={parameters.kind === "rocky" ? "Cloud cover" : "Atmospheric depth"}
                  value={parameters.atmosphere}
                  valueLabel={percentage(parameters.atmosphere)}
                  onChange={(value) => update("atmosphere", value)}
                />
                {parameters.kind === "rocky" ? (
                  <RangeControl
                    label="Surface water"
                    value={parameters.water}
                    valueLabel={
                      parameters.temperatureKelvin >= 650
                        ? "Boiled away"
                        : percentage(parameters.water)
                    }
                    onChange={(value) => update("water", value)}
                  />
                ) : null}
                <RangeControl
                  label="Rotation"
                  value={parameters.rotation}
                  valueLabel={percentage(parameters.rotation)}
                  onChange={(value) => update("rotation", value)}
                />
                <RangeControl
                  label="Axial tilt"
                  value={parameters.axialTilt}
                  valueLabel={`${Math.round((parameters.axialTilt - 0.5) * 90)}°`}
                  onChange={(value) => update("axialTilt", value)}
                />
                <label className={styles["switch"]}>
                  <span>Rings</span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={parameters.rings}
                    onChange={(event) => update("rings", event.currentTarget.checked)}
                  />
                </label>
              </fieldset>
            </div>
          ) : mode === "star" ? (
            <div className={styles["controls"]}>
              <fieldset className={styles["group"]}>
                <legend>Identity</legend>
                <Field label="Name">
                  <input
                    ref={nameRef}
                    type="text"
                    maxLength={32}
                    value={starParameters.name}
                    onChange={(event) => updateStar("name", event.currentTarget.value)}
                  />
                </Field>
                <Field label="Kind of star">
                  <select
                    value={starParameters.kind}
                    onChange={(event) =>
                      updateStar("kind", event.currentTarget.value as CustomStarParameters["kind"])
                    }
                  >
                    <option value="main-sequence">Main-sequence star</option>
                    <option value="evolved">Giant star</option>
                    <option value="variable">Variable star</option>
                    <option value="binary">Binary system</option>
                    <option value="white-dwarf">White dwarf</option>
                    <option value="neutron-star">Neutron star</option>
                  </select>
                </Field>
                <SeedField
                  value={starParameters.seed}
                  onChange={(seed) => updateStar("seed", seed)}
                />
              </fieldset>

              <fieldset className={styles["group"]}>
                <legend>Physics</legend>
                <RangeControl
                  label="Temperature"
                  min={2_000}
                  max={40_000}
                  step={100}
                  value={starParameters.temperatureKelvin}
                  valueLabel={`${starParameters.temperatureKelvin.toLocaleString()} K`}
                  onChange={(value) => updateStar("temperatureKelvin", value)}
                />
                <RangeControl
                  label="Size"
                  value={starParameters.radius}
                  valueLabel={percentage(starParameters.radius)}
                  onChange={(value) => updateStar("radius", value)}
                />
                <RangeControl
                  label="Surface activity"
                  value={starParameters.activity}
                  valueLabel={percentage(starParameters.activity)}
                  onChange={(value) => updateStar("activity", value)}
                />
                <RangeControl
                  label="Rotation"
                  value={starParameters.rotation}
                  valueLabel={percentage(starParameters.rotation)}
                  onChange={(value) => updateStar("rotation", value)}
                />
              </fieldset>
            </div>
          ) : (
            <div className={styles["controls"]}>
              <fieldset className={styles["group"]}>
                <legend>Identity</legend>
                <Field label="Name">
                  <input
                    ref={nameRef}
                    type="text"
                    maxLength={32}
                    value={blackHoleParameters.name}
                    onChange={(event) => updateBlackHole("name", event.currentTarget.value)}
                  />
                </Field>
                <Field label="Mass class">
                  <select
                    value={blackHoleParameters.kind}
                    onChange={(event) =>
                      updateBlackHole(
                        "kind",
                        event.currentTarget.value as CustomBlackHoleParameters["kind"],
                      )
                    }
                  >
                    <option value="stellar-mass">Stellar mass</option>
                    <option value="intermediate-mass">Intermediate mass</option>
                    <option value="supermassive">Supermassive</option>
                    <option value="ultramassive">Ultramassive</option>
                  </select>
                </Field>
                <SeedField
                  value={blackHoleParameters.seed}
                  onChange={(seed) => updateBlackHole("seed", seed)}
                />
              </fieldset>

              <fieldset className={styles["group"]}>
                <legend>Physics</legend>
                <RangeControl
                  label="Mass"
                  value={blackHoleParameters.mass}
                  valueLabel={blackHoleMassLabel(blackHoleParameters)}
                  onChange={(value) => updateBlackHole("mass", value)}
                />
                <RangeControl
                  label="Disk activity"
                  value={blackHoleParameters.diskActivity}
                  valueLabel={percentage(blackHoleParameters.diskActivity)}
                  onChange={(value) => updateBlackHole("diskActivity", value)}
                />
                <RangeControl
                  label="Disk hue"
                  min={0}
                  max={360}
                  step={1}
                  value={blackHoleParameters.diskHueDegrees}
                  valueLabel={`${blackHoleParameters.diskHueDegrees}°`}
                  onChange={(value) => updateBlackHole("diskHueDegrees", value)}
                />
                <RangeControl
                  label="Disk inclination"
                  min={0}
                  max={90}
                  step={1}
                  value={blackHoleParameters.diskTiltDegrees}
                  valueLabel={`${blackHoleParameters.diskTiltDegrees}°`}
                  onChange={(value) => updateBlackHole("diskTiltDegrees", value)}
                />
                <RangeControl
                  label="Jet strength"
                  value={blackHoleParameters.jetStrength}
                  valueLabel={percentage(blackHoleParameters.jetStrength)}
                  onChange={(value) => updateBlackHole("jetStrength", value)}
                />
              </fieldset>
            </div>
          )}
        </div>

        <footer className={styles["footer"]} data-style-role="builder-footer">
          <p>Opens in the viewer with a link that rebuilds exactly this object.</p>
          <Button type="submit" variant="primary" icon="sparkle">
            Generate {mode === "planet" ? "planet" : mode === "star" ? "star" : "black hole"}
          </Button>
        </footer>
      </form>
    </section>
  );
};
