import type { ApiErrorResponse, ExoplanetProfile, StarProfile } from "@exora/contracts";
import {
  apiErrorResponseSchema,
  blackHoleResponseSchema,
  blackHoleSearchResponseSchema,
  FEATURED_BLACK_HOLES,
  ephemerisResponseSchema,
  planetResponseSchema,
  planetSearchResponseSchema,
  starResponseSchema,
  starSearchResponseSchema,
} from "@exora/contracts";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import {
  BlackHoleArchiveError,
  type BlackHoleRepository,
  VizierBlackHoleRepository,
} from "./black-hole-archive.ts";
import {
  HORIZONS_API_VERSION,
  HORIZONS_SOURCE,
  HORIZONS_TARGETS,
  HorizonsError,
  type HorizonsRepository,
  JplHorizonsRepository,
} from "./horizons.ts";
import {
  NasaArchiveError,
  NasaPlanetRepository,
  PLANET_DISCOVERY_CATEGORIES,
  type PlanetDiscoveryCategory,
  type PlanetRepository,
  type RepositoryResult,
} from "./nasa-archive.ts";
import { NasaSystemAliasRepository, type SystemAliasRepository } from "./nasa-system-aliases.ts";
import {
  clientKey,
  createRateLimiter,
  DEFAULT_RATE_LIMIT,
  type RateLimiter,
} from "./rate-limit.ts";
import {
  SimbadArchiveError,
  SimbadStarRepository,
  STAR_DISCOVERY_CATEGORIES,
  type StarDiscoveryCategory,
  type StarRepository,
} from "./simbad-archive.ts";

interface CreateAppOptions {
  blackHoleRepository?: BlackHoleRepository;
  horizonsRateLimiter?: RateLimiter;
  horizonsRepository?: HorizonsRepository;
  rateLimiter?: RateLimiter;
  repository?: PlanetRepository;
  starRepository?: StarRepository;
  systemAliasRepository?: SystemAliasRepository;
  trustVercelProxy?: boolean;
}

const apiError = (code: ApiErrorResponse["error"]["code"], message: string): ApiErrorResponse =>
  apiErrorResponseSchema.parse({ error: { code, message } });

const renderApiError = (error: unknown, context: Context): Response => {
  if (error instanceof BlackHoleArchiveError) {
    return context.json(
      apiError("UPSTREAM_UNAVAILABLE", "BlackCAT is temporarily unavailable."),
      502,
    );
  }

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

  if (error instanceof HorizonsError) {
    return context.json(
      apiError(
        "UPSTREAM_UNAVAILABLE",
        "JPL Horizons is temporarily unavailable and no cached ephemeris covers this time.",
      ),
      502,
    );
  }

  return context.json(
    apiError("UPSTREAM_UNAVAILABLE", "The API could not complete the request."),
    500,
  );
};

const MAX_NAME_LENGTH = 100;

interface CachePolicy {
  browser: string;
  cdn: string;
}

const CACHE_POLICY = {
  catalog: {
    browser: "public, max-age=60",
    cdn: "public, max-age=900, stale-while-revalidate=21600, stale-if-error=86400",
  },
  liveLookup: {
    browser: "public, max-age=60",
    cdn: "public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400",
  },
  planetSearch: {
    browser: "public, max-age=0, must-revalidate",
    cdn: "public, max-age=300, stale-while-revalidate=3600, stale-if-error=21600",
  },
  starDiscovery: {
    browser: "public, max-age=120",
    cdn: "public, max-age=1800, stale-while-revalidate=43200, stale-if-error=86400",
  },
  starFeatured: {
    browser: "public, max-age=300",
    cdn: "public, max-age=3600, stale-while-revalidate=43200, stale-if-error=86400",
  },
} as const;

const setCachePolicy = (context: Context, policy: CachePolicy): void => {
  context.header("Cache-Control", policy.browser);
  context.header("CDN-Cache-Control", policy.cdn);
};

const requestedLimit = (context: Context, fallback: number): number => {
  const parsed = Number.parseInt(context.req.query("limit") ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const planetCollection = (
  context: Context,
  result: RepositoryResult<ExoplanetProfile[]>,
  query: string,
  cachePolicy: CachePolicy,
): Response => {
  setCachePolicy(context, cachePolicy);
  return context.json(
    planetSearchResponseSchema.parse({
      data: result.value,
      meta: {
        cached: result.cached,
        count: result.value.length,
        query,
        source: "NASA Exoplanet Archive",
      },
    }),
  );
};

const starCollection = (
  context: Context,
  result: RepositoryResult<StarProfile[]>,
  query: string,
  cachePolicy: CachePolicy,
): Response => {
  setCachePolicy(context, cachePolicy);
  return context.json(
    starSearchResponseSchema.parse({
      data: result.value,
      meta: { cached: result.cached, count: result.value.length, query, source: "SIMBAD" },
    }),
  );
};

export const createApp = ({
  blackHoleRepository = new VizierBlackHoleRepository(),
  horizonsRateLimiter = createRateLimiter({ limit: 8, windowMs: 60_000 }),
  horizonsRepository = new JplHorizonsRepository(),
  rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT),
  repository = new NasaPlanetRepository(),
  starRepository = new SimbadStarRepository(),
  systemAliasRepository = new NasaSystemAliasRepository(),
  trustVercelProxy = false,
}: CreateAppOptions = {}) => {
  const app = new Hono();
  const handleError = (error: unknown, context: Context): Response => {
    console.error("API request failed", {
      error,
      method: context.req.method,
      path: context.req.path,
    });
    return renderApiError(error, context);
  };

  app.use(
    "/api/*",
    // Public read-only data; abuse control is handled by the request budget below.
    cors({
      allowHeaders: [],
      allowMethods: ["GET", "OPTIONS"],
      credentials: false,
      maxAge: 86_400,
    }),
  );

  app.use("/api/*", async (context, next) => {
    const decision = rateLimiter.check(
      clientKey(
        {
          forwardedFor: context.req.header("x-forwarded-for"),
          realIp: context.req.header("x-real-ip"),
          vercelForwardedFor: context.req.header("x-vercel-forwarded-for"),
        },
        { trustVercelProxy },
      ),
      Date.now(),
    );

    context.header("RateLimit-Limit", String(decision.limit));
    context.header("RateLimit-Remaining", String(decision.remaining));
    context.header("RateLimit-Reset", String(Math.ceil(decision.resetAt / 1_000)));

    if (!decision.allowed) {
      context.header("Cache-Control", "no-store");
      context.header("Retry-After", String(decision.retryAfterSeconds));
      return context.json(
        apiError("RATE_LIMITED", "Too many requests. Please slow down and try again shortly."),
        429,
      );
    }

    await next();
  });

  app.get("/api/health", (context) =>
    context.json({ service: "exora-api", status: "ok" as const }),
  );

  app.get("/api/black-holes/featured", (context) => {
    setCachePolicy(context, CACHE_POLICY.catalog);
    return context.json(
      blackHoleSearchResponseSchema.parse({
        data: FEATURED_BLACK_HOLES,
        meta: {
          cached: true,
          count: FEATURED_BLACK_HOLES.length,
          query: "featured",
          source: "Exora curated featured",
          stale: false,
        },
      }),
    );
  });

  app.get("/api/black-holes", async (context) => {
    if (context.req.query("source") !== "observed") {
      return context.json(apiError("INVALID_REQUEST", "Black-hole source must be observed."), 400);
    }
    const result = await blackHoleRepository.browse(requestedLimit(context, 50));
    setCachePolicy(context, CACHE_POLICY.catalog);
    return context.json(
      blackHoleSearchResponseSchema.parse({
        data: result.value,
        meta: {
          cached: result.cached,
          count: result.value.length,
          query: "observed",
          source: "BlackCAT / CDS VizieR",
          stale: result.stale,
        },
      }),
    );
  });

  app.get("/api/black-holes/:name", async (context) => {
    const name = context.req.param("name").trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return context.json(apiError("INVALID_REQUEST", "Black-hole name is invalid."), 400);
    }
    const result = await blackHoleRepository.findByName(name);
    if (!result.value) {
      return context.json(
        apiError("NOT_FOUND", `No observed black hole named ${name} was found.`),
        404,
      );
    }
    setCachePolicy(context, CACHE_POLICY.catalog);
    return context.json(
      blackHoleResponseSchema.parse({
        data: result.value,
        meta: {
          cached: result.cached,
          source: "BlackCAT / CDS VizieR",
          stale: result.stale,
        },
      }),
    );
  });

  app.get("/api/ephemerides", async (context) => {
    const decision = horizonsRateLimiter.check(
      clientKey(
        {
          forwardedFor: context.req.header("x-forwarded-for"),
          realIp: context.req.header("x-real-ip"),
          vercelForwardedFor: context.req.header("x-vercel-forwarded-for"),
        },
        { trustVercelProxy },
      ),
      Date.now(),
    );
    context.header("Ephemeris-RateLimit-Limit", String(decision.limit));
    context.header("Ephemeris-RateLimit-Remaining", String(decision.remaining));
    if (!decision.allowed) {
      context.header("Cache-Control", "no-store");
      context.header("Retry-After", String(decision.retryAfterSeconds));
      return context.json(
        apiError("RATE_LIMITED", "Too many ephemeris requests. Please wait before trying again."),
        429,
      );
    }

    const at = context.req.query("at")?.trim() ?? "";
    const epoch = new Date(at);
    const minimum = Date.UTC(1900, 0, 1);
    const maximum = Date.UTC(2101, 0, 1);
    const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;
    if (
      !isoDate.test(at) ||
      !Number.isFinite(epoch.getTime()) ||
      epoch.getTime() < minimum ||
      epoch.getTime() >= maximum
    ) {
      return context.json(
        apiError("INVALID_REQUEST", "Ephemeris time must be an ISO date between 1900 and 2100."),
        400,
      );
    }

    const requestedIds = context.req.query("ids")?.trim();
    const naifIds = requestedIds
      ? requestedIds.split(",").map((value) => Number.parseInt(value, 10))
      : HORIZONS_TARGETS.map(({ naifId }) => naifId);
    const supportedIds = new Set<number>(HORIZONS_TARGETS.map(({ naifId }) => naifId));
    if (
      naifIds.length < 1 ||
      naifIds.length > HORIZONS_TARGETS.length ||
      new Set(naifIds).size !== naifIds.length ||
      naifIds.some((naifId) => !Number.isInteger(naifId) || !supportedIds.has(naifId))
    ) {
      return context.json(apiError("INVALID_REQUEST", "Ephemeris target list is invalid."), 400);
    }

    const result = await horizonsRepository.positions(naifIds, epoch);
    setCachePolicy(context, CACHE_POLICY.liveLookup);
    return context.json(
      ephemerisResponseSchema.parse({
        data: result.value,
        meta: {
          cached: result.cached,
          center: "Sun (10)",
          coordinateFrame: "Ecliptic J2000",
          epoch: epoch.toISOString(),
          retrievedAt: result.retrievedAt,
          source: HORIZONS_SOURCE,
          sourceVersion: HORIZONS_API_VERSION,
          stale: result.stale,
        },
      }),
    );
  });

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

    setCachePolicy(context, CACHE_POLICY.catalog);

    return context.json(
      planetResponseSchema.parse({
        data: result.value,
        meta: { cached: result.cached, source: "NASA Exoplanet Archive" },
      }),
    );
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

    setCachePolicy(context, CACHE_POLICY.catalog);

    return context.json(
      planetResponseSchema.parse({
        data: result.value,
        meta: { cached: result.cached, source: "NASA Exoplanet Archive" },
      }),
    );
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

  app.get("/api/stars/:name/planets", async (context) => {
    const name = context.req.param("name").trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return context.json(apiError("INVALID_REQUEST", "Star name is invalid."), 400);
    }

    const starResult = await starRepository.findByName(name);
    if (!starResult.value) {
      return context.json(apiError("NOT_FOUND", `No stellar object named ${name} was found.`), 404);
    }
    const star = starResult.value;

    const hostResult = await systemAliasRepository.resolveHost(star);
    if (!hostResult.value) {
      return planetCollection(
        context,
        { cached: hostResult.cached, value: [] },
        starResult.value.name,
        CACHE_POLICY.catalog,
      );
    }
    const host = hostResult.value;

    const planets = await repository.findByHost(host, requestedLimit(context, 12));
    return planetCollection(context, planets, host, CACHE_POLICY.catalog);
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

    setCachePolicy(context, CACHE_POLICY.catalog);
    return context.json(
      starResponseSchema.parse({
        data: result.value,
        meta: { cached: result.cached, source: "SIMBAD" },
      }),
    );
  });

  app.notFound((context) =>
    context.json(apiError("NOT_FOUND", "The requested API route does not exist."), 404),
  );

  app.onError(handleError);

  return app;
};

export const app = createApp();
