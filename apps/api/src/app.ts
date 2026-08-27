import type {
  ApiErrorResponse,
  ExoplanetProfile,
  SmallBodyLookup,
  StarProfile,
} from "@exora/contracts";
import {
  apiErrorResponseSchema,
  ephemerisResponseSchema,
  missionTrajectoryResponseSchema,
  planetResponseSchema,
  planetSearchResponseSchema,
  smallBodySearchResponseSchema,
  starResponseSchema,
  starSearchResponseSchema,
} from "@exora/contracts";
import { Hono, type Context } from "hono";
import { cors } from "hono/cors";
import { isAuthorizedCatalogRefresh, type CatalogRefreshDispatcher } from "./catalog-refresh.ts";
import { DatabaseError } from "./errors.ts";
import {
  HORIZONS_API_VERSION,
  HORIZONS_SOURCE,
  HORIZONS_TARGETS,
  HorizonsError,
  type HorizonsRepository,
  JplHorizonsRepository,
} from "./horizons.ts";
import {
  JplMissionTrajectoryRepository,
  MISSION_TRAJECTORY_TARGETS,
  type MissionTrajectoryRepository,
} from "./mission-trajectories.ts";
import {
  NasaArchiveError,
  NasaPlanetRepository,
  PLANET_DISCOVERY_CATEGORIES,
  type PlanetDiscoveryCategory,
  type PlanetRepository,
  type RepositoryResult,
} from "./nasa-archive.ts";
import { NasaSystemAliasRepository, type SystemAliasRepository } from "./nasa-system-aliases.ts";
import { ApiObservability, type Dependency } from "./observability.ts";
import { openApiDocument } from "./openapi.ts";
import {
  clientKey,
  createRateLimiter,
  DEFAULT_RATE_LIMIT,
  type RateLimiter,
} from "./rate-limit.ts";
import {
  JplSbdbRepository,
  SBDB_API_VERSION,
  SBDB_SOURCE,
  type SbdbRepository,
  SbdbError,
} from "./sbdb.ts";
import {
  SimbadArchiveError,
  SimbadStarRepository,
  STAR_DISCOVERY_CATEGORIES,
  type StarDiscoveryCategory,
  type StarRepository,
} from "./simbad-archive.ts";

interface CreateAppOptions {
  catalogRefresh?: {
    dispatcher: CatalogRefreshDispatcher;
    secret: string;
  };
  horizonsRateLimiter?: RateLimiter;
  horizonsRepository?: HorizonsRepository;
  missionRateLimiter?: RateLimiter;
  missionTrajectoryRepository?: MissionTrajectoryRepository;
  observability?: ApiObservability;
  /** Identifies whether the planet repository crosses the NASA or PostgreSQL boundary. */
  planetDataSource?: Extract<Dependency, "database" | "nasa">;
  /** Overridable so a test can exercise the limit without issuing a hundred requests. */
  rateLimiter?: RateLimiter;
  repository?: PlanetRepository;
  sbdbRateLimiter?: RateLimiter;
  sbdbRepository?: SbdbRepository;
  starRepository?: StarRepository;
  systemAliasRepository?: SystemAliasRepository;
  /** Trust Vercel's deployment-provided client address. Leave false outside Vercel. */
  trustVercelProxy?: boolean;
}

const apiError = (code: ApiErrorResponse["error"]["code"], message: string): ApiErrorResponse =>
  apiErrorResponseSchema.parse({ error: { code, message } });

const renderApiError = (error: unknown, context: Context): Response => {
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

  if (error instanceof SbdbError) {
    return context.json(
      apiError(
        "UPSTREAM_UNAVAILABLE",
        "JPL SBDB is temporarily unavailable and no cached small-body record covers this search.",
      ),
      502,
    );
  }

  if (error instanceof DatabaseError) {
    return context.json(
      apiError("UPSTREAM_UNAVAILABLE", "The catalog database is temporarily unavailable."),
      503,
    );
  }

  return context.json(
    apiError("UPSTREAM_UNAVAILABLE", "The API could not complete the request."),
    500,
  );
};

/** The longest a name either archive could plausibly carry; longer is a malformed request. */
const MAX_NAME_LENGTH = 100;

/**
 * How long each kind of answer may be reused, and how long a stale one may stand in while it
 * refreshes behind the request. Curated collections and single objects move on the archives'
 * schedule rather than ours, so they are held far longer than a free-text search.
 */
interface CachePolicy {
  browser: string;
  cdn: string;
}

const CACHE_POLICY = {
  /** Curated collections, host-system lookups, and single objects. */
  catalog: {
    browser: "public, max-age=60",
    cdn: "public, max-age=900, stale-while-revalidate=21600, stale-if-error=86400",
  },
  /** Ephemerides and small-body lookups that can change as upstream solutions are updated. */
  liveLookup: {
    browser: "public, max-age=60",
    cdn: "public, max-age=300, stale-while-revalidate=86400, stale-if-error=86400",
  },
  /** Historical mission samples change rarely but should still recover from solution updates. */
  missionTrajectory: {
    browser: "public, max-age=3600",
    cdn: "public, max-age=86400, stale-while-revalidate=2592000, stale-if-error=2592000",
  },
  /** Free-text planet search: the most likely thing to be retried with a different spelling. */
  planetSearch: {
    browser: "public, max-age=0, must-revalidate",
    cdn: "public, max-age=300, stale-while-revalidate=3600, stale-if-error=21600",
  },
  /** SIMBAD's curated star collections. */
  starDiscovery: {
    browser: "public, max-age=120",
    cdn: "public, max-age=1800, stale-while-revalidate=43200, stale-if-error=86400",
  },
  /** The fixed featured set, which only changes when this file does. */
  starFeatured: {
    browser: "public, max-age=300",
    cdn: "public, max-age=3600, stale-while-revalidate=43200, stale-if-error=86400",
  },
} as const;

const setCachePolicy = (context: Context, policy: CachePolicy): void => {
  context.header("Cache-Control", policy.browser);
  context.header("CDN-Cache-Control", policy.cdn);
};

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
  catalogRefresh,
  horizonsRateLimiter = createRateLimiter({ limit: 8, windowMs: 60_000 }),
  horizonsRepository = new JplHorizonsRepository(),
  missionRateLimiter = createRateLimiter({ limit: 8, windowMs: 60_000 }),
  missionTrajectoryRepository = new JplMissionTrajectoryRepository(),
  observability = new ApiObservability(),
  planetDataSource = "nasa",
  rateLimiter = createRateLimiter(DEFAULT_RATE_LIMIT),
  repository = new NasaPlanetRepository(),
  sbdbRateLimiter = createRateLimiter({ limit: 20, windowMs: 60_000 }),
  sbdbRepository = new JplSbdbRepository(),
  starRepository = new SimbadStarRepository(),
  systemAliasRepository = new NasaSystemAliasRepository(),
  trustVercelProxy = false,
}: CreateAppOptions = {}) => {
  const app = new Hono();
  const handleError = (error: unknown, context: Context): Response => {
    observability.recordFailure(context, error);
    return renderApiError(error, context);
  };

  // This middleware is registered before every route so scheduled/internal requests and errors
  // receive the same correlation header and completion record as the public API.
  app.use("*", observability.middleware(handleError));

  const dependency = <T>(
    context: Context,
    source: Dependency,
    operation: string,
    work: () => Promise<T>,
  ): Promise<T> => observability.dependency(context, source, operation, work);

  // Vercel only schedules this short dispatch. The archive-wide work runs on a durable external
  // worker because its upstream timeout alone is longer than this function's deployment limit.
  app.get("/api/internal/catalog-refresh", async (context) => {
    context.header("Cache-Control", "no-store");
    if (
      !catalogRefresh ||
      !isAuthorizedCatalogRefresh(context.req.header("authorization"), catalogRefresh.secret)
    ) {
      return context.json({ accepted: false }, 401);
    }

    await catalogRefresh.dispatcher.dispatch();
    return context.json({ accepted: true }, 202);
  });

  app.use(
    "/api/*",
    cors({
      // Deliberately open. The responses are public, read-only, unauthenticated astronomy data
      // with no cookies or credentials attached, and the browser's origin check would not slow
      // down the abuse this API actually has to worry about — a script calling it server-side
      // never sends an Origin at all. The request budget below is what bounds that.
      allowMethods: ["GET", "OPTIONS"],
      maxAge: 86_400,
    }),
  );

  app.use("/api/*", async (context, next) => {
    const decision = rateLimiter.check(
      clientKey({ forwardedFor: context.req.header("x-forwarded-for") }, { trustVercelProxy }),
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

  app.get("/api/openapi.json", (context) => context.json(openApiDocument));

  app.get("/api/ephemerides", async (context) => {
    const decision = horizonsRateLimiter.check(
      clientKey({ forwardedFor: context.req.header("x-forwarded-for") }, { trustVercelProxy }),
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

    const result = await dependency(context, "jpl", "horizons.positions", () =>
      horizonsRepository.positions(naifIds, epoch),
    );
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

  app.get("/api/mission-trajectories", async (context) => {
    const decision = missionRateLimiter.check(
      clientKey({ forwardedFor: context.req.header("x-forwarded-for") }, { trustVercelProxy }),
      Date.now(),
    );
    context.header("Mission-RateLimit-Limit", String(decision.limit));
    context.header("Mission-RateLimit-Remaining", String(decision.remaining));
    if (!decision.allowed) {
      context.header("Cache-Control", "no-store");
      context.header("Retry-After", String(decision.retryAfterSeconds));
      return context.json(
        apiError("RATE_LIMITED", "Too many mission requests. Please wait before trying again."),
        429,
      );
    }

    const spkId = context.req.query("spk")?.trim() ?? "";
    const start = context.req.query("start")?.trim() ?? "";
    const stop = context.req.query("stop")?.trim() ?? "";
    const stepDays = Number.parseInt(context.req.query("step")?.trim() ?? "", 10);
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const startDate = new Date(`${start}T00:00:00Z`);
    const stopDate = new Date(`${stop}T00:00:00Z`);
    const durationDays = (stopDate.getTime() - startDate.getTime()) / 86_400_000;
    const supported = new Set<string>(MISSION_TRAJECTORY_TARGETS.map((target) => target.spkId));
    if (
      !supported.has(spkId) ||
      !datePattern.test(start) ||
      !datePattern.test(stop) ||
      !Number.isFinite(startDate.getTime()) ||
      !Number.isFinite(stopDate.getTime()) ||
      start < "1970-01-01" ||
      stop > "2036-01-01" ||
      !Number.isInteger(stepDays) ||
      stepDays < 1 ||
      stepDays > 365 ||
      durationDays <= 0 ||
      Math.ceil(durationDays / stepDays) + 1 > 400
    ) {
      return context.json(
        apiError(
          "INVALID_REQUEST",
          "Mission trajectory requires an allowlisted SPK ID, valid 1970–2036 dates, and 2–400 samples.",
        ),
        400,
      );
    }

    const result = await dependency(context, "jpl", "horizons.trajectory", () =>
      missionTrajectoryRepository.trajectory(spkId, start, stop, stepDays),
    );
    setCachePolicy(context, CACHE_POLICY.missionTrajectory);
    return context.json(
      missionTrajectoryResponseSchema.parse({
        data: result.value,
        meta: {
          cached: result.cached,
          center: "Sun (10)",
          coordinateFrame: "Ecliptic J2000",
          retrievedAt: result.retrievedAt,
          solution: result.solution,
          source: HORIZONS_SOURCE,
          sourceVersion: HORIZONS_API_VERSION,
          spkId: result.target.spkId,
          stale: result.stale,
          stepDays,
          targetName: result.target.name,
        },
      }),
    );
  });

  app.get("/api/small-bodies", async (context) => {
    const decision = sbdbRateLimiter.check(
      clientKey({ forwardedFor: context.req.header("x-forwarded-for") }, { trustVercelProxy }),
      Date.now(),
    );
    context.header("SmallBody-RateLimit-Limit", String(decision.limit));
    context.header("SmallBody-RateLimit-Remaining", String(decision.remaining));
    if (!decision.allowed) {
      context.header("Cache-Control", "no-store");
      context.header("Retry-After", String(decision.retryAfterSeconds));
      return context.json(
        apiError("RATE_LIMITED", "Too many small-body searches. Please wait before trying again."),
        429,
      );
    }

    const query = context.req.query("q")?.trim() ?? "";
    const lookup = (context.req.query("lookup")?.trim() || "auto") as SmallBodyLookup;
    if (query.length < 1 || query.length > MAX_NAME_LENGTH || query.includes("*")) {
      return context.json(
        apiError(
          "INVALID_REQUEST",
          "Small-body search must contain 1 to 100 characters and cannot use wildcards.",
        ),
        400,
      );
    }
    if (!(["auto", "designation", "spk"] as const).includes(lookup)) {
      return context.json(apiError("INVALID_REQUEST", "Small-body lookup mode is invalid."), 400);
    }
    if (lookup === "spk" && !/^\d+$/.test(query)) {
      return context.json(apiError("INVALID_REQUEST", "SPK identifiers must be numeric."), 400);
    }

    const result = await dependency(context, "jpl", "sbdb.search", () =>
      sbdbRepository.search(query, lookup),
    );
    setCachePolicy(context, CACHE_POLICY.liveLookup);
    return context.json(
      smallBodySearchResponseSchema.parse({
        data: result.data,
        matches: result.matches,
        meta: {
          cached: result.cached,
          lookup,
          query,
          retrievedAt: result.retrievedAt,
          source: SBDB_SOURCE,
          sourceVersion: SBDB_API_VERSION,
          stale: result.stale,
          status: result.status,
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
      const result = await dependency(context, planetDataSource, "planets.browse", () =>
        repository.browse(requestedLimit(context, 120)),
      );
      return planetCollection(context, result, "physical-controls", CACHE_POLICY.catalog);
    }

    if (hostStar) {
      if (hostStar.length > MAX_NAME_LENGTH) {
        return context.json(apiError("INVALID_REQUEST", "Host star name is invalid."), 400);
      }
      const result = await dependency(context, planetDataSource, "planets.find_by_host", () =>
        repository.findByHost(hostStar, requestedLimit(context, 12)),
      );
      return planetCollection(context, result, hostStar, CACHE_POLICY.catalog);
    }

    if (category) {
      if (!PLANET_DISCOVERY_CATEGORIES.has(category as PlanetDiscoveryCategory)) {
        return context.json(
          apiError("INVALID_REQUEST", "Planet discovery category is invalid."),
          400,
        );
      }
      const result = await dependency(context, planetDataSource, "planets.discover", () =>
        repository.discover(category as PlanetDiscoveryCategory, requestedLimit(context, 12)),
      );
      return planetCollection(context, result, category, CACHE_POLICY.catalog);
    }

    if (query.length < 1) {
      return context.json(
        apiError("INVALID_REQUEST", "Search query must contain at least one character."),
        400,
      );
    }

    const result = await dependency(context, planetDataSource, "planets.search", () =>
      repository.search(query, requestedLimit(context, 12)),
    );
    return planetCollection(context, result, query, CACHE_POLICY.planetSearch);
  });

  app.get("/api/planets/featured", async (context) => {
    const result = await dependency(context, planetDataSource, "planets.find_by_name", () =>
      repository.findByName("Kepler-297 b"),
    );

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

    const result = await dependency(context, planetDataSource, "planets.find_by_name", () =>
      repository.findByName(name),
    );

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
    const result = await dependency(context, "simbad", "stars.featured", () =>
      starRepository.featured(),
    );
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
      const result = await dependency(context, "simbad", "stars.discover", () =>
        starRepository.discover(category as StarDiscoveryCategory, requestedLimit(context, 12)),
      );
      return starCollection(context, result, category, CACHE_POLICY.starDiscovery);
    }
    if (query.length < 1) {
      return context.json(
        apiError("INVALID_REQUEST", "Star name must contain at least one character."),
        400,
      );
    }

    const featuredResult = await dependency(context, "simbad", "stars.featured", () =>
      starRepository.featured(),
    );
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

    const result = await dependency(context, "simbad", "stars.search", () =>
      starRepository.search(query, requestedLimit(context, 12)),
    );
    return starCollection(context, result, query, CACHE_POLICY.catalog);
  });

  app.get("/api/stars/:name/planets", async (context) => {
    const name = context.req.param("name").trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return context.json(apiError("INVALID_REQUEST", "Star name is invalid."), 400);
    }

    const starResult = await dependency(context, "simbad", "stars.find_by_name", () =>
      starRepository.findByName(name),
    );
    if (!starResult.value) {
      return context.json(apiError("NOT_FOUND", `No stellar object named ${name} was found.`), 404);
    }
    const star = starResult.value;

    const hostResult = await dependency(context, "nasa", "system_aliases.resolve_host", () =>
      systemAliasRepository.resolveHost(star),
    );
    if (!hostResult.value) {
      return planetCollection(
        context,
        { cached: hostResult.cached, value: [] },
        starResult.value.name,
        CACHE_POLICY.catalog,
      );
    }
    const host = hostResult.value;

    const planets = await dependency(context, planetDataSource, "planets.find_by_host", () =>
      repository.findByHost(host, requestedLimit(context, 12)),
    );
    return planetCollection(context, planets, host, CACHE_POLICY.catalog);
  });

  app.get("/api/stars/:name", async (context) => {
    const name = context.req.param("name").trim();
    if (!name || name.length > MAX_NAME_LENGTH) {
      return context.json(apiError("INVALID_REQUEST", "Star name is invalid."), 400);
    }

    const result = await dependency(context, "simbad", "stars.find_by_name", () =>
      starRepository.findByName(name),
    );
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
