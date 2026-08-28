import {
  context as otelContext,
  metrics,
  propagation,
  SpanKind,
  SpanStatusCode,
  trace,
  type Attributes,
  type Span,
  type TextMapGetter,
} from "@opentelemetry/api";
import type { Context, Next } from "hono";
import { routePath } from "hono/route";
import { classifyError, classifyStatus, type ErrorClassification } from "./errors.ts";

export type Dependency = "jpl" | "nasa" | "simbad";
type CacheOutcome = "hit" | "miss" | "not_applicable" | "stale_fallback";

export interface StructuredLogRecord {
  [key: string]: boolean | number | string | undefined;
  event: "dependency.completed" | "dependency.failed" | "request.completed";
  timestamp: string;
}

export type StructuredLogSink = (record: StructuredLogRecord) => void;

export interface ObservabilityOptions {
  log?: StructuredLogSink;
  now?: () => number;
  randomUUID?: () => string;
}

interface RequestState {
  failure?: ErrorClassification;
  requestId: string;
}

interface DependencyResult {
  cached?: boolean;
  stale?: boolean;
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const headerGetter: TextMapGetter<Headers> = {
  get: (headers, key) => headers.get(key) ?? undefined,
  keys: (headers) => [...headers.keys()],
};
const tracer = trace.getTracer("@exora/api");
const meter = metrics.getMeter("@exora/api");
const requestDuration = meter.createHistogram("exora.api.request.duration", {
  description: "API request duration",
  unit: "ms",
});
const requestCount = meter.createCounter("exora.api.request.count", {
  description: "Completed API requests",
  unit: "{request}",
});
const dependencyDuration = meter.createHistogram("exora.api.dependency.duration", {
  description: "NASA, SIMBAD, and JPL operation duration",
  unit: "ms",
});
const dependencyCount = meter.createCounter("exora.api.dependency.count", {
  description: "Completed dependency operations by cache outcome",
  unit: "{operation}",
});

const defaultLog: StructuredLogSink = (record) => {
  const line = JSON.stringify(record);
  if (record.event === "dependency.failed") console.error(line);
  else console.log(line);
};

const durationMs = (startedAt: number, now: () => number): number =>
  Math.max(0, Math.round((now() - startedAt) * 100) / 100);

const traceFields = (span: Span): Partial<Pick<StructuredLogRecord, "span_id" | "trace_id">> => {
  const context = span.spanContext();
  return context.traceId === "00000000000000000000000000000000"
    ? {}
    : { span_id: context.spanId, trace_id: context.traceId };
};

const cacheOutcome = (result: unknown): CacheOutcome => {
  if (!result || typeof result !== "object") return "not_applicable";
  const candidate = result as DependencyResult;
  if (candidate.stale === true) return "stale_fallback";
  if (candidate.cached === true) return "hit";
  if (candidate.cached === false) return "miss";
  return "not_applicable";
};

const requestIdFrom = (header: string | undefined, randomUUID: () => string): string =>
  header && REQUEST_ID_PATTERN.test(header) ? header : randomUUID();

export class ApiObservability {
  readonly #log: StructuredLogSink;
  readonly #now: () => number;
  readonly #randomUUID: () => string;
  readonly #requests = new WeakMap<Context, RequestState>();

  constructor(options: ObservabilityOptions = {}) {
    this.#log = options.log ?? defaultLog;
    this.#now = options.now ?? performance.now.bind(performance);
    this.#randomUUID = options.randomUUID ?? crypto.randomUUID.bind(crypto);
  }

  requestId(context: Context): string {
    return this.#requests.get(context)?.requestId ?? "unavailable";
  }

  recordFailure(context: Context, error: unknown): void {
    const state = this.#requests.get(context);
    if (state) state.failure = classifyError(error);
  }

  middleware(
    renderError: (error: unknown, context: Context) => Response,
  ): (context: Context, next: Next) => Promise<void> {
    return async (context, next) => {
      const requestId = requestIdFrom(context.req.header("x-request-id"), this.#randomUUID);
      this.#requests.set(context, { requestId });
      context.header("X-Request-ID", requestId);
      const startedAt = this.#now();

      const parentContext = propagation.extract(
        otelContext.active(),
        context.req.raw.headers,
        headerGetter,
      );
      await otelContext.with(parentContext, () =>
        tracer.startActiveSpan(
          `${context.req.method} api.request`,
          { kind: SpanKind.SERVER },
          async (span) => {
            let failure: ErrorClassification | undefined;
            try {
              await next();
            } catch (error) {
              failure = classifyError(error);
              context.res = renderError(error, context);
            } finally {
              const route = routePath(context) || "unmatched";
              const status = context.res.status;
              failure ??= this.#requests.get(context)?.failure ?? classifyStatus(status);
              const duration = durationMs(startedAt, this.#now);
              const attributes: Attributes = {
                "error.type": failure,
                "http.request.method": context.req.method,
                "http.response.status_code": status,
                "http.route": route,
              };
              span.setAttributes(attributes);
              span.updateName(`${context.req.method} ${route}`);
              if (failure) span.setStatus({ code: SpanStatusCode.ERROR });
              requestDuration.record(duration, attributes);
              requestCount.add(1, attributes);
              this.#log({
                duration_ms: duration,
                error_type: failure,
                event: "request.completed",
                method: context.req.method,
                request_id: requestId,
                route,
                status,
                timestamp: new Date().toISOString(),
                ...traceFields(span),
              });
              span.end();
            }
          },
        ),
      );
    };
  }

  async dependency<T>(
    context: Context,
    dependency: Dependency,
    operation: string,
    work: () => Promise<T>,
  ): Promise<T> {
    const startedAt = this.#now();
    return tracer.startActiveSpan(
      `${dependency}.${operation}`,
      { kind: SpanKind.CLIENT },
      async (span) => {
        const baseAttributes: Attributes = {
          "dependency.name": dependency,
          "dependency.operation": operation,
        };
        span.setAttributes(baseAttributes);
        try {
          const result = await work();
          const cache = cacheOutcome(result);
          const duration = durationMs(startedAt, this.#now);
          const attributes = { ...baseAttributes, "cache.outcome": cache };
          span.setAttributes(attributes);
          dependencyDuration.record(duration, attributes);
          dependencyCount.add(1, attributes);
          this.#log({
            cache,
            dependency,
            duration_ms: duration,
            event: "dependency.completed",
            operation,
            request_id: this.requestId(context),
            timestamp: new Date().toISOString(),
            ...traceFields(span),
          });
          return result;
        } catch (error) {
          const classification = classifyError(error);
          const duration = durationMs(startedAt, this.#now);
          const attributes = { ...baseAttributes, "error.type": classification };
          span.setAttributes(attributes);
          span.setStatus({ code: SpanStatusCode.ERROR });
          dependencyDuration.record(duration, attributes);
          dependencyCount.add(1, attributes);
          this.#log({
            dependency,
            duration_ms: duration,
            error_type: classification,
            event: "dependency.failed",
            operation,
            request_id: this.requestId(context),
            timestamp: new Date().toISOString(),
            ...traceFields(span),
          });
          throw error;
        } finally {
          span.end();
        }
      },
    );
  }
}
