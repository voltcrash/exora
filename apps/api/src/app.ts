import type { ApiErrorResponse, PlanetResponse, PlanetSearchResponse } from "@exora/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { NasaArchiveError, NasaPlanetRepository, type PlanetRepository } from "./nasa-archive.ts";

interface CreateAppOptions {
  repository?: PlanetRepository;
}

const apiError = (code: ApiErrorResponse["error"]["code"], message: string): ApiErrorResponse => ({
  error: { code, message },
});

export const createApp = ({ repository = new NasaPlanetRepository() }: CreateAppOptions = {}) => {
  const app = new Hono();

  app.use(
    "/api/*",
    cors({
      allowMethods: ["GET", "OPTIONS"],
      maxAge: 86_400,
    }),
  );

  app.get("/api/health", (context) =>
    context.json({ service: "exora-api", status: "ok" as const }),
  );

  app.get("/api/planets", async (context) => {
    const query = context.req.query("q")?.trim() ?? "";

    if (query.length < 2) {
      return context.json(
        apiError("INVALID_REQUEST", "Search query must contain at least two characters."),
        400,
      );
    }

    const requestedLimit = Number.parseInt(context.req.query("limit") ?? "12", 10);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
    const result = await repository.search(query, limit);

    context.header("Cache-Control", "public, max-age=300, stale-while-revalidate=3600");

    return context.json<PlanetSearchResponse>({
      data: result.value,
      meta: {
        cached: result.cached,
        count: result.value.length,
        query,
        source: "NASA Exoplanet Archive",
      },
    });
  });

  app.get("/api/planets/featured", async (context) => {
    const result = await repository.findByName("HIP 65426 b");

    if (!result.value) {
      return context.json(apiError("NOT_FOUND", "Featured planet was not found."), 404);
    }

    context.header("Cache-Control", "public, max-age=900, stale-while-revalidate=21600");

    return context.json<PlanetResponse>({
      data: result.value,
      meta: { cached: result.cached, source: "NASA Exoplanet Archive" },
    });
  });

  app.get("/api/planets/:name", async (context) => {
    const name = context.req.param("name").trim();

    if (!name || name.length > 100) {
      return context.json(apiError("INVALID_REQUEST", "Planet name is invalid."), 400);
    }

    const result = await repository.findByName(name);

    if (!result.value) {
      return context.json(
        apiError("NOT_FOUND", `No confirmed planet named ${name} was found.`),
        404,
      );
    }

    context.header("Cache-Control", "public, max-age=900, stale-while-revalidate=21600");

    return context.json<PlanetResponse>({
      data: result.value,
      meta: { cached: result.cached, source: "NASA Exoplanet Archive" },
    });
  });

  app.notFound((context) =>
    context.json(apiError("NOT_FOUND", "The requested API route does not exist."), 404),
  );

  app.onError((error, context) => {
    console.error(error);

    if (error instanceof NasaArchiveError) {
      return context.json(
        apiError("UPSTREAM_UNAVAILABLE", "NASA Exoplanet Archive is temporarily unavailable."),
        502,
      );
    }

    return context.json(
      apiError("UPSTREAM_UNAVAILABLE", "The API could not complete the request."),
      500,
    );
  });

  return app;
};

export const app = createApp();
