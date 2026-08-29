import {
  generateCustomBlackHole,
  generateCustomStar,
  generateCustomWorld,
  WORLDGEN_VERSION,
  type CustomBlackHole,
  type CustomBlackHoleParameters,
  type CustomPlanetParameters,
  type CustomStar,
  type CustomStarParameters,
  type CustomWorld,
  type Rgb,
} from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";
import { useTabList } from "../use-tab-list.ts";
import sharedStyles from "./ExperienceShared.module.css";
import catalogStyles from "./CatalogShared.module.css";
import builderStyles from "./CustomPlanetBuilder.module.css";
import { bindStyles } from "../styles/bind-styles.ts";

const cx = bindStyles(sharedStyles, catalogStyles, builderStyles);

export type ForgeMode = "black-hole" | "planet" | "star";

const FORGE_MODES: readonly ForgeMode[] = ["planet", "star", "black-hole"];

interface WorldForgeProps {
  embedded?: boolean;
  initialMode: ForgeMode;
  onClose: () => void;
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
  <label className={cx("parameter-control")}>
    <span>
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

const spectralClass = (temperatureKelvin: number): string => {
  if (temperatureKelvin >= 30_000) return "O · BLUE";
  if (temperatureKelvin >= 10_000) return "B · BLUE-WHITE";
  if (temperatureKelvin >= 7_500) return "A · WHITE";
  if (temperatureKelvin >= 6_000) return "F · YELLOW-WHITE";
  if (temperatureKelvin >= 5_200) return "G · YELLOW";
  if (temperatureKelvin >= 3_700) return "K · ORANGE";
  return "M · RED";
};

const stellarColor = (temperatureKelvin: number): string => {
  if (temperatureKelvin >= 30_000) return "#8fb3ff";
  if (temperatureKelvin >= 10_000) return "#a7c1ff";
  if (temperatureKelvin >= 7_500) return "#d7e0ff";
  if (temperatureKelvin >= 6_000) return "#fff0c7";
  if (temperatureKelvin >= 5_200) return "#ffc766";
  if (temperatureKelvin >= 3_700) return "#ff8a36";
  return "#ff4b24";
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
  embedded = false,
  initialMode,
  onClose,
  onGenerateBlackHole,
  onGeneratePlanet,
  onGenerateStar,
}: WorldForgeProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<ForgeMode>(initialMode);
  const [parameters, setParameters] = useState(initialParameters);
  const [starParameters, setStarParameters] = useState(initialStarParameters);
  const [blackHoleParameters, setBlackHoleParameters] = useState(initialBlackHoleParameters);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!embedded) dialog?.showModal();
    const focusName = window.setTimeout(() => nameRef.current?.focus(), 0);

    return () => {
      window.clearTimeout(focusName);
      dialog?.close();
    };
  }, [embedded]);

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

  const radiusLabel =
    parameters.kind === "rocky"
      ? `${(0.45 + parameters.radius * 1.65).toFixed(2)} R⊕`
      : parameters.kind === "ice-giant"
        ? `${(2.1 + parameters.radius * 4.2).toFixed(1)} R⊕`
        : `${(0.72 + parameters.radius * 1.18).toFixed(2)} RJ`;

  return (
    <dialog
      ref={dialogRef}
      className={cx(`planet-builder${embedded ? " embedded-forge" : ""}`)}
      data-testid="planet-builder"
      data-embedded={embedded}
      open={embedded || undefined}
      role={embedded ? "region" : undefined}
      aria-label={embedded ? "World Forge" : undefined}
      aria-labelledby={embedded ? undefined : "builder-title"}
      onCancel={embedded ? undefined : onClose}
      onClose={embedded ? undefined : onClose}
      onClick={(event) => {
        if (!embedded && event.target === dialogRef.current) onClose();
      }}
    >
      <form
        data-testid="planet-builder-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "planet") onGeneratePlanet(generateCustomWorld(parameters));
          else if (mode === "star") onGenerateStar(generateCustomStar(starParameters));
          else onGenerateBlackHole(generateCustomBlackHole(blackHoleParameters));
        }}
      >
        {!embedded ? (
          <div className={cx("builder-header")}>
            <div>
              <p>EXORA WORLD FORGE · CELESTIAL SYNTHESIS</p>
              <h2 id="builder-title">Design a celestial object</h2>
            </div>
            <button
              className={cx("catalog-close")}
              type="button"
              aria-label="Close world forge"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        ) : null}

        <div className={cx("forge-tabs")} data-style-role="forge-tabs" {...tabs.tabListProps}>
          <button
            {...tabs.tabProps("planet")}
            className={cx(mode === "planet" ? "active" : "")}
            onClick={() => setMode("planet")}
          >
            <span className={cx("catalog-radar")} aria-hidden="true" />
            <span>
              <small>PLANET MAKER</small>
              <strong>BUILD A WORLD</strong>
            </span>
          </button>
          <button
            {...tabs.tabProps("star")}
            className={cx(mode === "star" ? "active" : "")}
            onClick={() => setMode("star")}
          >
            <span className={cx("star-symbol")} aria-hidden="true">
              ✦
            </span>
            <span>
              <small>STAR MAKER</small>
              <strong>IGNITE A STAR</strong>
            </span>
          </button>
          <button
            {...tabs.tabProps("black-hole")}
            className={cx(mode === "black-hole" ? "active" : "")}
            onClick={() => setMode("black-hole")}
          >
            <span className={cx("black-hole-symbol")} aria-hidden="true" />
            <span>
              <small>BLACK HOLE MAKER</small>
              <strong>COLLAPSE SPACETIME</strong>
            </span>
          </button>
        </div>

        {mode === "planet" ? (
          <div
            className={cx("builder-body")}
            data-style-role="builder-body"
            {...tabs.panelProps("planet")}
          >
            <section className={cx("builder-identity")} aria-label="World identity">
              <label>
                <span>WORLD NAME</span>
                <input
                  ref={nameRef}
                  type="text"
                  maxLength={32}
                  value={parameters.name}
                  onChange={(event) => update("name", event.currentTarget.value)}
                />
              </label>
              <label>
                <span>WORLD FAMILY</span>
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
              </label>
              <label>
                <span>PRIMARY PALETTE</span>
                <span className={cx("color-input")}>
                  <input
                    type="color"
                    value={toHex(parameters.baseColor)}
                    onChange={(event) => update("baseColor", fromHex(event.currentTarget.value))}
                  />
                  <output>{toHex(parameters.baseColor).toUpperCase()}</output>
                </span>
              </label>
              <label>
                <span>GENERATION SEED</span>
                <span className={cx("seed-input")}>
                  <input
                    type="number"
                    min={0}
                    max={999999}
                    value={parameters.seed}
                    onChange={(event) => update("seed", event.currentTarget.valueAsNumber || 0)}
                  />
                  <button
                    type="button"
                    onClick={() => update("seed", Math.floor(Math.random() * 1_000_000))}
                  >
                    RANDOMIZE
                  </button>
                </span>
              </label>
            </section>

            <section className={cx("builder-parameters")} aria-label="World parameters">
              <RangeControl
                label="Planet scale"
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
                label={parameters.kind === "rocky" ? "Cloud density" : "Atmospheric depth"}
                value={parameters.atmosphere}
                valueLabel={percentage(parameters.atmosphere)}
                onChange={(value) => update("atmosphere", value)}
              />
              {parameters.kind === "rocky" ? (
                <RangeControl
                  label="Surface water"
                  value={parameters.water}
                  valueLabel={
                    parameters.temperatureKelvin >= 650 ? "VAPORIZED" : percentage(parameters.water)
                  }
                  onChange={(value) => update("water", value)}
                />
              ) : null}
              <label className={cx("toggle-control")}>
                <span>
                  Ring system
                  <small>{parameters.rings ? "ENABLED" : "DISABLED"}</small>
                </span>
                <input
                  type="checkbox"
                  checked={parameters.rings}
                  onChange={(event) => update("rings", event.currentTarget.checked)}
                />
              </label>
              <RangeControl
                label="Rotation rate"
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
            </section>
          </div>
        ) : mode === "star" ? (
          <div
            className={cx("builder-body star-builder-body")}
            data-style-role="builder-body"
            {...tabs.panelProps("star")}
          >
            <section className={cx("builder-identity")} aria-label="Star identity">
              <label>
                <span>STAR NAME</span>
                <input
                  ref={nameRef}
                  type="text"
                  maxLength={32}
                  value={starParameters.name}
                  onChange={(event) => updateStar("name", event.currentTarget.value)}
                />
              </label>
              <label>
                <span>STELLAR FAMILY</span>
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
              </label>
              <div className={cx("stellar-preview")} aria-label="Derived spectral class">
                <span
                  className={cx("preview-star")}
                  aria-hidden="true"
                  style={{
                    background: stellarColor(starParameters.temperatureKelvin),
                    boxShadow: `0 0 12px ${stellarColor(starParameters.temperatureKelvin)}, 0 0 30px color-mix(in srgb, ${stellarColor(starParameters.temperatureKelvin)} 35%, transparent)`,
                  }}
                />
                <span>
                  <small>DERIVED SPECTRUM</small>
                  <strong>{spectralClass(starParameters.temperatureKelvin)}</strong>
                </span>
              </div>
              <label>
                <span>GENERATION SEED</span>
                <span className={cx("seed-input")}>
                  <input
                    type="number"
                    min={0}
                    max={999999}
                    value={starParameters.seed}
                    onChange={(event) => updateStar("seed", event.currentTarget.valueAsNumber || 0)}
                  />
                  <button
                    type="button"
                    onClick={() => updateStar("seed", Math.floor(Math.random() * 1_000_000))}
                  >
                    RANDOMIZE
                  </button>
                </span>
              </label>
            </section>

            <section className={cx("builder-parameters")} aria-label="Star parameters">
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
                label="Visual scale"
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
                label="Rotation rate"
                value={starParameters.rotation}
                valueLabel={percentage(starParameters.rotation)}
                onChange={(value) => updateStar("rotation", value)}
              />
            </section>
          </div>
        ) : (
          <div
            className={cx("builder-body black-hole-builder-body")}
            data-style-role="builder-body"
            {...tabs.panelProps("black-hole")}
          >
            <section className={cx("builder-identity")} aria-label="Black hole identity">
              <label>
                <span>BLACK HOLE NAME</span>
                <input
                  ref={nameRef}
                  type="text"
                  maxLength={32}
                  value={blackHoleParameters.name}
                  onChange={(event) => updateBlackHole("name", event.currentTarget.value)}
                />
              </label>
              <label>
                <span>MASS CLASS</span>
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
              </label>
              <div className={cx("black-hole-preview")} aria-label="Derived black hole mass">
                <span className={cx("preview-black-hole")} aria-hidden="true" />
                <span>
                  <small>EVENT HORIZON CLASS</small>
                  <strong>{blackHoleMassLabel(blackHoleParameters)}</strong>
                </span>
              </div>
              <label>
                <span>GENERATION SEED</span>
                <span className={cx("seed-input")}>
                  <input
                    type="number"
                    min={0}
                    max={999999}
                    value={blackHoleParameters.seed}
                    onChange={(event) =>
                      updateBlackHole("seed", event.currentTarget.valueAsNumber || 0)
                    }
                  />
                  <button
                    type="button"
                    onClick={() => updateBlackHole("seed", Math.floor(Math.random() * 1_000_000))}
                  >
                    RANDOMIZE
                  </button>
                </span>
              </label>
            </section>

            <section className={cx("builder-parameters")} aria-label="Black hole parameters">
              <RangeControl
                label="Mass"
                value={blackHoleParameters.mass}
                valueLabel={blackHoleMassLabel(blackHoleParameters)}
                onChange={(value) => updateBlackHole("mass", value)}
              />
              <RangeControl
                label="Accretion disk activity"
                value={blackHoleParameters.diskActivity}
                valueLabel={percentage(blackHoleParameters.diskActivity)}
                onChange={(value) => updateBlackHole("diskActivity", value)}
              />
              <RangeControl
                label="Accretion disk hue"
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
                label="Relativistic jet strength"
                value={blackHoleParameters.jetStrength}
                valueLabel={percentage(blackHoleParameters.jetStrength)}
                onChange={(value) => updateBlackHole("jetStrength", value)}
              />
            </section>
          </div>
        )}

        <footer className={cx("builder-footer")} data-style-role="builder-footer">
          <p>
            <span aria-hidden="true" /> The generated URL includes this versioned recipe (Worldgen v
            {WORLDGEN_VERSION}), so it reloads and can be shared.
          </p>
          <button className={cx("generate-world")} type="submit">
            <span className={cx("button-orbit")} aria-hidden="true" />
            <span>
              <small>COMPILE PARAMETERS</small>
              <strong>
                GENERATE {mode === "planet" ? "PLANET" : mode === "star" ? "STAR" : "BLACK HOLE"}
              </strong>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        </footer>
      </form>
    </dialog>
  );
};
