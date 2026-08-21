import type {
  ApiErrorResponse,
  ExoplanetProfile,
  PlanetResponse,
  PlanetSearchResponse,
  StarProfile,
  StarResponse,
  StarSearchResponse,
} from "@exora/contracts";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  NasaArchiveError,
  NasaPlanetRepository,
  PLANET_DISCOVERY_CATEGORIES,
  type PlanetDiscoveryCategory,
  type PlanetRepository,
  type RepositoryResult,
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

/** The longest a name either archive could plausibly carry; longer is a malformed request. */
const MAX_NAME_LENGTH = 100;

/**
 * How long each kind of answer may be reused, and how long a stale one may stand in while it
 * refreshes behind the request. Curated collections and single objects move on the archives'
 * schedule rather than ours, so they are held far longer than a free-text search.
 */
const CACHE_POLICY = {
  /** Curated collections, host-system lookups, and single objects. */
  catalog: "public, max-age=900, stale-while-revalidate=21600",
  /** Free-text planet search: the most likely thing to be retried with a different spelling. */
  planetSearch: "public, max-age=300, stale-while-revalidate=3600",
  /** SIMBAD's curated star collections. */
  starDiscovery: "public, max-age=1800, stale-while-revalidate=43200",
  /** The fixed featured set, which only changes when this file does. */
  starFeatured: "public, max-age=3600, stale-while-revalidate=43200",
} as const;

/**
 * The page size the caller asked for, or `fallback` when they did not ask for a usable one.
 *
 * Deliberately not a validation step: every repository clamps to its own bounds, so a number out
 * of range is narrowed rather than refused, and only an unparseable one falls back.
 */
const requestedLimit = (context: Context, fallback: number): number => {
  const parsed = Number.parseInt(context.req.query("limit") ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const planetCollection = (
  context: Context,
  result: RepositoryResult<ExoplanetProfile[]>,
  query: string,
  cachePolicy: string,
): Response => {
  context.header("Cache-Control", cachePolicy);
  return context.json<PlanetSearchResponse>({
    data: result.value,
    meta: {
      cached: result.cached,
      count: result.value.length,
      query,
      source: "NASA Exoplanet Archive",
    },
  });
};

const starCollection = (
  context: Context,
  result: RepositoryResult<StarProfile[]>,
  query: string,
  cachePolicy: string,
): Response => {
  context.header("Cache-Control", cachePolicy);
  return context.json<StarSearchResponse>({
    data: result.value,
    meta: { cached: result.cached, count: result.value.length, query, source: "SIMBAD" },
  });
};

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
    const browse = context.req.query("browse")?.trim() ?? "";

    if (browse === "physical-controls") {
      const result = await repository.browse(requestedLimit(context, 120));
      return planetCollection(context, result, "physical-controls", CACHE_POLICY.catalog);
    }

    if (hostStar) {
      if (hostStar.length > MAX_NAME_LENGTH) {
        return context.json(apiError("INVALID_REQUEST", "Host star name is invalid."), 400);
      }
      const result = await repository.findByHost(hostStar, requestedLimit(context, 12));
      return planetCollection(context, result, hostStar, CACHE_POLICY.catalog);
    }

    if (category) {
      if (!PLANET_DISCOVERY_CATEGORIES.has(category as PlanetDiscoveryCategory)) {
        return context.json(
          apiError("INVALID_REQUEST", "Planet discovery category is invalid."),
          400,
        );
      }
      const result = await repository.discover(
        category as PlanetDiscoveryCategory,
        requestedLimit(context, 12),
      );
      return planetCollection(context, result, category, CACHE_POLICY.catalog);
    }

    if (query.length < 1) {
      return context.json(
        apiError("INVALID_REQUEST", "Search query must contain at least one character."),
        400,
      );
    }

    const result = await repository.search(query, requestedLimit(context, 12));
    return planetCollection(context, result, query, CACHE_POLICY.planetSearch);
  });

  app.get("/api/planets/featured", async (context) => {
    const result = await repository.findByName("Kepler-297 b");

    if (!result.value) {
      return context.json(apiError("NOT_FOUND", "Featured planet was not found."), 404);
    }

    context.header("Cache-Control", CACHE_POLICY.catalog);

    return context.json<PlanetResponse>({
      data: result.value,
      meta: { cached: result.cached, source: "NASA Exoplanet Archive" },
    });
  });

  app.get("/api/planets/:name", async (context) => {
    const name = context.req.param("name").trim();

    if (!name || name.length > MAX_NAME_LENGTH) {
      return context.json(apiError("INVALID_REQUEST", "Planet name is invalid."), 400);
    }

    const result = await repository.findByName(name);

    if (!result.value) {
      return context.json(
        apiError("NOT_FOUND", `No confirmed planet named ${name} was found.`),
        404,
      );
    }

    context.header("Cache-Control", CACHE_POLICY.catalog);

    return context.json<PlanetResponse>({
      data: result.value,
      meta: { cached: result.cached, source: "NASA Exoplanet Archive" },
    });
  });

  app.get("/api/stars/featured", async (context) => {
    const result = await starRepository.featured();
    return starCollection(context, result, "", CACHE_POLICY.starFeatured);
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
      const result = await starRepository.discover(
        category as StarDiscoveryCategory,
        requestedLimit(context, 12),
      );
      return starCollection(context, result, category, CACHE_POLICY.starDiscovery);
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
      return starCollection(
        context,
        { cached: featuredResult.cached, value: predictiveStars },
        query,
        CACHE_POLICY.starFeatured,
      );
    }

    const result = await starRepository.search(query, requestedLimit(context, 12));
    return starCollection(context, result, query, CACHE_POLICY.catalog);
  });

  app.get("/api/stars/:name", async (context) => {
    const name = context.req.param("name").trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return context.json(apiError("INVALID_REQUEST", "Star name is invalid."), 400);
    }

    const result = await starRepository.findByName(name);
    if (!result.value) {
      return context.json(apiError("NOT_FOUND", `No stellar object named ${name} was found.`), 404);
    }

    context.header("Cache-Control", CACHE_POLICY.catalog);
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
