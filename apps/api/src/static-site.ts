import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Hono } from "hono";

export interface HeaderRule {
  headers: [name: string, value: string][];
  pattern: RegExp;
}

const pathPattern = (path: string): RegExp =>
  new RegExp(`^${path.replaceAll(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*")}$`);

/** Rules from a `_headers` file: an unindented path pattern, then indented `Name: value` lines. */
export const parseHeaderRules = (source: string): HeaderRule[] => {
  const rules: HeaderRule[] = [];
  for (const line of source.split("\n")) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) {
      rules.push({ headers: [], pattern: pathPattern(line.trim()) });
      continue;
    }
    const separator = line.indexOf(":");
    const rule = rules.at(-1);
    if (rule && separator > 0) {
      rule.headers.push([line.slice(0, separator).trim(), line.slice(separator + 1).trim()]);
    }
  }
  return rules;
};

/** Same-site rewrites (status 200) from a `_redirects` file, by exact source path. */
export const parseRewrites = (source: string): Map<string, string> => {
  const rewrites = new Map<string, string>();
  for (const line of source.split("\n")) {
    const [from, to, status] = line.trim().split(/\s+/);
    if (from?.startsWith("/") && to?.startsWith("/") && status === "200") rewrites.set(from, to);
  }
  return rewrites;
};

const readOptional = (path: string): string => (existsSync(path) ? readFileSync(path, "utf8") : "");

// Host configuration and build metadata are never files a visitor can fetch.
const isHidden = (path: string): boolean =>
  path.split("/").some((segment) => segment.startsWith(".") || segment.startsWith("_"));

/**
 * Serves a built website the way Cloudflare's static assets do: `_headers` and `_redirects`
 * rewrites apply, a directory without its trailing slash redirects to it, and a missing page
 * answers 404 with `404.html`. Routes registered earlier, such as `/api/*`, take precedence.
 */
export const serveStaticSite = (app: Hono, root: string): void => {
  const rules = parseHeaderRules(readOptional(join(root, "_headers")));
  const rewrites = parseRewrites(readOptional(join(root, "_redirects")));
  const notFoundPage = readOptional(join(root, "404.html"));

  app.use("*", async (context, next) => {
    const path = context.req.path;
    if (path.startsWith("/api/")) return next();

    const directory = join(root, path);
    if (isHidden(path)) {
      context.res = context.html(notFoundPage, 404);
    } else if (!path.endsWith("/") && existsSync(directory) && statSync(directory).isDirectory()) {
      context.res = context.redirect(`${path}/${new URL(context.req.url).search}`, 307);
    } else {
      await next();
      if (context.res.status === 404) context.res = context.html(notFoundPage, 404);
    }

    // Cloudflare's default for assets no _headers rule caches longer.
    context.res.headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    for (const rule of rules) {
      if (!rule.pattern.test(path)) continue;
      for (const [name, value] of rule.headers) context.res.headers.set(name, value);
    }
    return context.res;
  });

  app.get(
    "*",
    serveStatic({
      root,
      rewriteRequestPath: (path) => rewrites.get(path) ?? path,
    }),
  );
};
