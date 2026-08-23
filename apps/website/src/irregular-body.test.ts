import { describe, expect, it } from "vite-plus/test";
import { NullEngine } from "@babylonjs/core/Engines/nullEngine.js";
import { Scene } from "@babylonjs/core/scene.js";
import {
  createIrregularBody,
  irregularBodyCameraEnvelope,
  selectIrregularShapeAsset,
  validateIrregularBodyDescriptor,
  type IrregularBodyDescriptor,
  type IrregularShapeAsset,
} from "./irregular-body.ts";
import { deriveRenderQuality } from "./render-quality.ts";

const provenance = {
  credit: "NASA/JPL",
  license: "NASA media guidelines",
  mission: "Test mission",
  naifId: 2_000_433,
  originalUrl: "https://pds.nasa.gov/example",
  retrievalDate: "2026-08-23",
  source: "NASA PDS",
  spkId: "20000433",
};

const asset = (triangleCount: number, format: "glb" | "obj" = "glb"): IrregularShapeAsset => ({
  format,
  path: `/models/eros-${triangleCount}.${format}`,
  provenance,
  sha256: "a".repeat(64),
  triangleCount,
});

const descriptor: IrregularBodyDescriptor = {
  dimensionsKilometers: { x: 34.4, y: 11.2, z: 11.2 },
  name: "433 Eros",
  naifId: 2_000_433,
  rotation: { axialTiltDegrees: 89, periodHours: 5.270255 },
  shapeModel: {
    lods: [asset(800_000), asset(180_000), asset(50_000, "obj")],
    sourceKind: "mission-glb",
  },
  spkId: "20000433",
  surface: {
    albedoColor: [0.38, 0.31, 0.25],
    roughness: 0.92,
    treatment: "physically-neutral",
  },
};

describe("irregular-body asset selection", () => {
  it("selects the highest measured LOD inside a device triangle budget", () => {
    expect(selectIrregularShapeAsset(descriptor.shapeModel, 900_000)?.triangleCount).toBe(800_000);
    expect(selectIrregularShapeAsset(descriptor.shapeModel, 240_000)?.triangleCount).toBe(180_000);
    expect(selectIrregularShapeAsset(descriptor.shapeModel, 60_000)?.triangleCount).toBe(50_000);
  });

  it("falls back to measured dimensions instead of loading a shape that exceeds the budget", () => {
    expect(selectIrregularShapeAsset(descriptor.shapeModel, 20_000)).toBeNull();
    expect(selectIrregularShapeAsset(undefined, 900_000)).toBeNull();
  });

  it("accepts attributed OBJ and GLB models", () => {
    expect(validateIrregularBodyDescriptor(descriptor)).toEqual([]);
  });

  it("requires a lossless conversion record for browser GLBs derived from NAIF DSK plates", () => {
    const dskDescriptor: IrregularBodyDescriptor = {
      ...descriptor,
      shapeModel: { ...descriptor.shapeModel!, sourceKind: "naif-dsk-conversion" },
    };
    expect(validateIrregularBodyDescriptor(dskDescriptor)).toContain(
      "/models/eros-800000.glb must retain its NAIF DSK conversion record",
    );

    const converted = {
      ...dskDescriptor,
      shapeModel: {
        sourceKind: "naif-dsk-conversion" as const,
        lods: dskDescriptor.shapeModel!.lods.map((model) => ({
          ...model,
          conversion: {
            convertedOn: "2026-08-23",
            sourceDskSha256: "b".repeat(64),
            sourceDskUrl: "https://naif.jpl.nasa.gov/example.bds",
            tool: "NAIF dskexp N0067 + glTF Transform 4.2.1",
          },
        })),
      },
    };
    expect(validateIrregularBodyDescriptor(converted)).toEqual([]);
  });
});

describe("irregular-body physical scale", () => {
  it("frames metre-scale and hundred-kilometre bodies consistently without losing physical scale", () => {
    const dimorphos = irregularBodyCameraEnvelope({ x: 0.177, y: 0.174, z: 0.116 });
    const vesta = irregularBodyCameraEnvelope({ x: 572.6, y: 557.2, z: 446.4 });

    expect(dimorphos.sceneDiameter).toBe(vesta.sceneDiameter);
    expect(dimorphos.initialRadius).toBe(vesta.initialRadius);
    expect(dimorphos.kilometersPerSceneUnit).toBeCloseTo(0.177 / 6.4);
    expect(vesta.kilometersPerSceneUnit).toBeCloseTo(572.6 / 6.4);
  });

  it("rejects missing dimensions rather than inventing a generic spherical size", () => {
    expect(() => irregularBodyCameraEnvelope({ x: 0, y: 12, z: 8 })).toThrow(
      /positive measured dimensions/i,
    );
  });

  it("builds a proportionally measured neutral fallback with a real night-side light", async () => {
    const engine = new NullEngine({
      deterministicLockstep: false,
      lockstepMaxSteps: 4,
      renderHeight: 128,
      renderWidth: 128,
      textureSize: 128,
    });
    const scene = new Scene(engine);
    const profile = deriveRenderQuality({ pixelRatio: 1, userAgent: "Desktop" });
    const mounted = await createIrregularBody(
      scene,
      { ...descriptor, shapeModel: undefined },
      profile,
    );
    const geometry = scene.getTransformNodeByName("433 Eros-measured-geometry");

    expect(mounted.geometryStatus).toBe("dimensions-only");
    expect(mounted.selectedAsset).toBeNull();
    expect(mounted.surfaceDisclosure).toMatch(/dimensions-only/i);
    expect(geometry).not.toBeNull();
    if (!geometry) throw new Error("Measured-geometry root was not created.");
    expect(geometry.scaling.x / geometry.scaling.y).toBeCloseTo(34.4 / 11.2);
    expect(scene.lights).toHaveLength(1);

    mounted.dispose();
    expect(scene.lights).toHaveLength(0);
    engine.dispose();
  });
});
