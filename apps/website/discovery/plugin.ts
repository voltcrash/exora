import { readFileSync } from "node:fs";
import { decodePlanetCatalog, type PlanetCatalogSnapshot } from "@exora/planet-catalog";
import type { Plugin } from "vite-plus";
import {
  buildLlmsText,
  buildPages,
  buildSitemap,
  homepage,
  renderBody,
  renderDocument,
  renderHead,
} from "./pages.ts";

export const discoveryPages = (): Plugin => {
  const snapshot = JSON.parse(
    readFileSync(
      new URL("../../../packages/planet-catalog/data/pscomppars.json", import.meta.url),
      "utf8",
    ),
  ) as PlanetCatalogSnapshot;
  const pages = buildPages(decodePlanetCatalog(snapshot));
  const documents = new Map(pages.map((page) => [page.path, renderDocument(page)]));
  const sitemap = buildSitemap(pages);
  const llms = buildLlmsText(pages);

  return {
    name: "exora:discovery-pages",
    transformIndexHtml: {
      order: "pre",
      handler: (html) =>
        html
          .replace("<!-- discovery:head -->", renderHead(homepage))
          .replace("<!-- discovery:body -->", renderBody(homepage)),
    },
    generateBundle() {
      for (const [path, html] of documents) {
        this.emitFile({ type: "asset", fileName: `${path.slice(1)}index.html`, source: html });
      }
      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: sitemap });
      this.emitFile({ type: "asset", fileName: "llms.txt", source: llms });
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url ?? "/", "http://localhost").pathname;
        const document = documents.get(path);
        const source = path === "/sitemap.xml" ? sitemap : path === "/llms.txt" ? llms : document;
        if (source === undefined) {
          if (documents.has(`${path}/`)) {
            response.writeHead(308, {
              Location: `${path}/${new URL(request.url ?? "/", "http://localhost").search}`,
            });
            response.end();
            return;
          }
          next();
          return;
        }
        response.setHeader(
          "Content-Type",
          path === "/sitemap.xml"
            ? "application/xml; charset=utf-8"
            : path === "/llms.txt"
              ? "text/plain; charset=utf-8"
              : "text/html; charset=utf-8",
        );
        response.end(source);
      });
    },
  };
};
