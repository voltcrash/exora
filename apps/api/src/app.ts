import type {
  ApiErrorResponse,
  PlanetResponse,
  PlanetSearchResponse,
  StarResponse,
  StarSearchResponse,
} from "@exora/contracts";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  NasaArchiveError,
  NasaPlanetRepository,
  PLANET_DISCOVERY_CATEGORIES,
  type PlanetDiscoveryCategory,
  type PlanetRepository,
} from "./nasa-archive.ts";
import {
  SimbadArchiveError,
  SimbadStarRepository,
  STAR_DISCOVERY_CATEGORIES,
  type StarDiscoveryCategory,
  type StarRepository,
} from "./simbad-archive.ts";

interface CreateAppOptions {
  repository?: PlanetRepository;
  starRepository?: StarRepository;
}

const apiError = (code: ApiErrorResponse["error"]["code"], message: string): ApiErrorResponse => ({
  error: { code, message },
});

export const createApp = ({
  repository = new NasaPlanetRepository(),
  starRepository = new SimbadStarRepository(),
}: CreateAppOptions = {}) => {
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
    const category = context.req.query("category")?.trim() ?? "";
    const hostStar = context.req.query("host")?.trim() ?? "";

    if (hostStar) {
      if (hostStar.length > 100) {
        return context.json(apiError("INVALID_REQUEST", "Host star name is invalid."), 400);
      }
      const requestedLimit = Number.parseInt(context.req.query("limit") ?? "12", 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
      const result = await repository.findByHost(hostStar, limit);
      context.header("Cache-Control", "public, max-age=900, stale-while-revalidate=21600");
      return context.json<PlanetSearchResponse>({
        data: result.value,
        meta: {
          cached: result.cached,
          count: result.value.length,
          query: hostStar,
          source: "NASA Exoplanet Archive",
        },
      });
    }

    if (category) {
      if (!PLANET_DISCOVERY_CATEGORIES.has(category as PlanetDiscoveryCategory)) {
        return context.json(
          apiError("INVALID_REQUEST", "Planet discovery category is invalid."),
          400,
        );
      }
      const requestedLimit = Number.parseInt(context.req.query("limit") ?? "12", 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
      const result = await repository.discover(category as PlanetDiscoveryCategory, limit);
      context.header("Cache-Control", "public, max-age=900, stale-while-revalidate=21600");
      return context.json<PlanetSearchResponse>({
        data: result.value,
        meta: {
          cached: result.cached,
          count: result.value.length,
          query: category,
          source: "NASA Exoplanet Archive",
        },
      });
    }

    if (query.length < 1) {
      return context.json(
        apiError("INVALID_REQUEST", "Search query must contain at least one character."),
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

  app.get("/api/stars/featured", async (context) => {
    const result = await starRepository.featured();
    context.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=43200");
    return context.json<StarSearchResponse>({
      data: result.value,
      meta: {
        cached: result.cached,
        count: result.value.length,
        query: "",
        source: "SIMBAD",
      },
    });
  });

  app.get("/api/stars", async (context) => {
    const query = context.req.query("q")?.trim() ?? "";
    const category = context.req.query("category")?.trim() ?? "";
    if (category) {
      if (!STAR_DISCOVERY_CATEGORIES.has(category as StarDiscoveryCategory)) {
        return context.json(
          apiError("INVALID_REQUEST", "Star discovery category is invalid."),
          400,
        );
      }
      const requestedLimit = Number.parseInt(context.req.query("limit") ?? "12", 10);
      const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
      const result = await starRepository.discover(category as StarDiscoveryCategory, limit);
      context.header("Cache-Control", "public, max-age=1800, stale-while-revalidate=43200");
      return context.json<StarSearchResponse>({
        data: result.value,
        meta: {
          cached: result.cached,
          count: result.value.length,
          query: category,
          source: "SIMBAD",
        },
      });
    }
    if (query.length < 1) {
      return context.json(
        apiError("INVALID_REQUEST", "Star name must contain at least one character."),
        400,
      );
    }

    const featuredResult = await starRepository.featured();
    const normalizedQuery = query.toLowerCase();
    const predictiveStars = featuredResult.value.filter(
      (star) =>
        star.name.toLowerCase().startsWith(normalizedQuery) ||
        star.catalogName
          .toLowerCase()
          .replace(/^\*\s*/, "")
          .startsWith(normalizedQuery),
    );
    if (predictiveStars.length > 0 || query.length <= 2) {
      context.header("Cache-Control", "public, max-age=3600, stale-while-revalidate=43200");
      return context.json<StarSearchResponse>({
        data: predictiveStars,
        meta: {
          cached: featuredResult.cached,
          count: predictiveStars.length,
          query,
          source: "SIMBAD",
        },
      });
    }

    const requestedLimit = Number.parseInt(context.req.query("limit") ?? "12", 10);
    const limit = Number.isFinite(requestedLimit) ? requestedLimit : 12;
    const result = await starRepository.search(query, limit);
    context.header("Cache-Control", "public, max-age=900, stale-while-revalidate=21600");
    return context.json<StarSearchResponse>({
      data: result.value,
      meta: {
        cached: result.cached,
        count: result.value.length,
        query,
        source: "SIMBAD",
      },
    });
  });

  app.get("/api/stars/:name", async (context) => {
    const name = context.req.param("name").trim();
    if (!name || name.length > 100) {
      return context.json(apiError("INVALID_REQUEST", "Star name is invalid."), 400);
    }

    const result = await starRepository.findByName(name);
    if (!result.value) {
      return context.json(apiError("NOT_FOUND", `No stellar object named ${name} was found.`), 404);
    }

    context.header("Cache-Control", "public, max-age=900, stale-while-revalidate=21600");
    return context.json<StarResponse>({
      data: result.value,
      meta: { cached: result.cached, source: "SIMBAD" },
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

    if (error instanceof SimbadArchiveError) {
      return context.json(
        apiError("UPSTREAM_UNAVAILABLE", "SIMBAD star archive is temporarily unavailable."),
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
