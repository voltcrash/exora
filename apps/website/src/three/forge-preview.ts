import type { WorldRecipe } from "@exora/worldgen";
import {
  PerspectiveCamera,
  RepeatWrapping,
  Scene,
  TextureLoader,
  type Texture,
  WebGLRenderer,
} from "three";
import { createPlanetGlobe } from "./planet-globe.ts";

export function createForgePreview(
  canvas: HTMLCanvasElement,
  firstDraw: () => void,
  failed: () => void,
) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: "low-power" });
  renderer.setClearColor(0x060910);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  const camera = new PerspectiveCamera(35, 1, 0.05, 120);
  const scene = new Scene();
  const loader = new TextureLoader();
  let live = true;
  let needsStrata = false;
  let strata: Texture<HTMLImageElement> | null = null;
  const ready = () => {
    if (live) draw(0);
  };
  const error = () => {
    if (live) failed();
  };
  const flow = loader.load("/textures/fields/convection.png", ready, undefined, error);
  flow.wrapS = RepeatWrapping;
  let globe: ReturnType<typeof createPlanetGlobe> | null = null;
  let width = 0,
    height = 0,
    extent = 0,
    elapsed = 0,
    previous = 0;
  let presented = false;
  let lost = false;
  const contextLost = () => {
    lost = true;
    presented = false;
    failed();
  };
  const contextRestored = () => {
    lost = false;
    draw(0);
  };
  canvas.addEventListener("webglcontextlost", contextLost);
  canvas.addEventListener("webglcontextrestored", contextRestored);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  function draw(now: number) {
    if (lost || !globe || !width || !height || !flow.image || (needsStrata && !strata?.image))
      return;
    if (previous && now && !reduced.matches) elapsed += Math.min(0.05, (now - previous) / 1000);
    previous = now;
    globe.update(elapsed);
    renderer.render(scene, camera);
    if (!presented) {
      presented = true;
      firstDraw();
    }
  }
  const fit = () => {
    if (!extent || !width || !height) return;
    camera.aspect = width / height;
    const distance = (extent * 3.85) / Math.min(1, camera.aspect);
    camera.position.set(0, distance * 0.29, distance);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    draw(0);
  };
  const size = new ResizeObserver(([entry]) => {
    if (!entry) return;
    width = Math.round(entry.contentRect.width);
    height = Math.round(entry.contentRect.height);
    if (width && height) renderer.setSize(width, height, false);
    fit();
  });
  size.observe(canvas);
  let visible = false;
  const animate = () => {
    previous = 0;
    renderer.setAnimationLoop(visible && !document.hidden && !reduced.matches ? draw : null);
    draw(0);
  };
  const visibility = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    animate();
  });
  visibility.observe(canvas);
  reduced.addEventListener("change", animate);
  document.addEventListener("visibilitychange", animate);
  return {
    setWorld(recipe: WorldRecipe) {
      globe?.dispose();
      needsStrata = recipe.renderer === "rocky";
      if (needsStrata && !strata) {
        strata = loader.load("/textures/fields/lithosphere.png", ready, undefined, () => {
          if (!live) return;
          strata?.dispose();
          strata = null;
          if (needsStrata) error();
        });
        strata.wrapS = RepeatWrapping;
      }
      if (needsStrata && !strata?.image && presented) {
        presented = false;
        failed();
      }
      globe = createPlanetGlobe(recipe, strata ?? flow, flow, 96);
      scene.add(globe.root);
      extent = Math.max(4.2, globe.extent);
      fit();
    },
    dispose() {
      live = false;
      canvas.removeEventListener("webglcontextlost", contextLost);
      canvas.removeEventListener("webglcontextrestored", contextRestored);
      size.disconnect();
      visibility.disconnect();
      reduced.removeEventListener("change", animate);
      document.removeEventListener("visibilitychange", animate);
      renderer.setAnimationLoop(null);
      globe?.dispose();
      strata?.dispose();
      flow.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
