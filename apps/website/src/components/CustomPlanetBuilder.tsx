import {
  generateCustomStar,
  generateCustomWorld,
  type CustomPlanetParameters,
  type CustomStar,
  type CustomStarParameters,
  type CustomWorld,
  type Rgb,
} from "@exora/worldgen";
import { useEffect, useRef, useState } from "react";

interface WorldForgeProps {
  initialMode: "planet" | "star";
  onClose: () => void;
  onGeneratePlanet: (world: CustomWorld) => void;
  onGenerateStar: (star: CustomStar) => void;
  open: boolean;
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
  <label className="parameter-control">
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

export const WorldForge = ({
  initialMode,
  onClose,
  onGeneratePlanet,
  onGenerateStar,
  open,
}: WorldForgeProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"planet" | "star">("planet");
  const [parameters, setParameters] = useState(initialParameters);
  const [starParameters, setStarParameters] = useState(initialStarParameters);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      setMode(initialMode);
      dialog.showModal();
      window.setTimeout(() => nameRef.current?.focus(), 0);
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [initialMode, open]);

  const update = <Key extends keyof CustomPlanetParameters>(
    key: Key,
    value: CustomPlanetParameters[Key],
  ): void => setParameters((current) => ({ ...current, [key]: value }));

  const updateStar = <Key extends keyof CustomStarParameters>(
    key: Key,
    value: CustomStarParameters[Key],
  ): void => setStarParameters((current) => ({ ...current, [key]: value }));

  const radiusLabel =
    parameters.kind === "rocky"
      ? `${(0.45 + parameters.radius * 1.65).toFixed(2)} R⊕`
      : parameters.kind === "ice-giant"
        ? `${(2.1 + parameters.radius * 4.2).toFixed(1)} R⊕`
        : `${(0.72 + parameters.radius * 1.18).toFixed(2)} RJ`;

  return (
    <dialog
      ref={dialogRef}
      className="planet-builder"
      aria-labelledby="builder-title"
      onCancel={onClose}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "planet") onGeneratePlanet(generateCustomWorld(parameters));
          else onGenerateStar(generateCustomStar(starParameters));
        }}
      >
        <div className="builder-header">
          <div>
            <p>EXORA WORLD FORGE · CELESTIAL SYNTHESIS</p>
            <h2 id="builder-title">Design a celestial object</h2>
          </div>
          <button
            className="catalog-close"
            type="button"
            aria-label="Close world forge"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="forge-tabs" role="tablist" aria-label="Object type">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "planet"}
            className={mode === "planet" ? "active" : ""}
            onClick={() => setMode("planet")}
          >
            <span className="catalog-radar" aria-hidden="true" />
            <span>
              <small>PLANET MAKER</small>
              <strong>BUILD A WORLD</strong>
            </span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "star"}
            className={mode === "star" ? "active" : ""}
            onClick={() => setMode("star")}
          >
            <span className="star-symbol" aria-hidden="true">
              ✦
            </span>
            <span>
              <small>STAR MAKER</small>
              <strong>IGNITE A STAR</strong>
            </span>
          </button>
        </div>

        {mode === "planet" ? (
          <div className="builder-body" role="tabpanel">
            <section className="builder-identity" aria-label="World identity">
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
                <span className="color-input">
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
                <span className="seed-input">
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

            <section className="builder-parameters" aria-label="World parameters">
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
              <label className="toggle-control">
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
        ) : (
          <div className="builder-body star-builder-body" role="tabpanel">
            <section className="builder-identity" aria-label="Star identity">
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
              <div className="stellar-preview" aria-label="Derived spectral class">
                <span
                  className="preview-star"
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
                <span className="seed-input">
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

            <section className="builder-parameters" aria-label="Star parameters">
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
        )}

        <footer className="builder-footer">
          <p>
            <span aria-hidden="true" /> Every parameter feeds the renderer. Reuse a seed to recreate
            the same {mode === "planet" ? "world" : "star"}.
          </p>
          <button className="generate-world" type="submit">
            <span className="button-orbit" aria-hidden="true" />
            <span>
              <small>COMPILE PARAMETERS</small>
              <strong>GENERATE {mode === "planet" ? "PLANET" : "STAR"}</strong>
            </span>
            <span aria-hidden="true">↗</span>
          </button>
        </footer>
      </form>
    </dialog>
  );
};
