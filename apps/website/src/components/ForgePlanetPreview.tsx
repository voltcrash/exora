import { useEffect, useRef, useState } from "react";
import type { CustomWorld } from "@exora/worldgen";
import type { createForgePreview } from "../three/forge-preview.ts";
import { PlanetCatalogVisual } from "./CatalogVisual.tsx";
import styles from "./CustomPlanetBuilder.module.css";

export function ForgePlanetPreview({ world }: { world: CustomWorld }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [preview, setPreview] = useState<ReturnType<typeof createForgePreview> | null>(null);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    let active = true;
    let resource: ReturnType<typeof createForgePreview> | undefined;
    const fallback = () => {
      if (active) setDrawn(false);
    };
    const element = canvas.current!;
    void import("../three/forge-preview.ts")
      .then(({ createForgePreview }) => {
        if (!active) return;
        resource = createForgePreview(
          element,
          () => {
            if (active) setDrawn(true);
          },
          fallback,
        );
        setPreview(resource);
      })
      .catch(fallback);
    return () => {
      active = false;
      resource?.dispose();
    };
  }, []);
  useEffect(() => {
    preview?.setWorld(world.recipe);
  }, [world.recipe, preview]);
  return (
    <div
      className={styles["globe-stage"]}
      data-renderer={world.recipe.renderer}
      role="img"
      aria-label={`Preview of ${world.planet.name}`}
    >
      {!drawn && <PlanetCatalogVisual planet={world.planet} recipe={world.recipe} />}
      <canvas ref={canvas} data-ready={drawn} aria-hidden="true" />
    </div>
  );
}
