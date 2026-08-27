import { expect, test, vi } from "vite-plus/test";
import {
  GitHubCatalogRefreshDispatcher,
  isAuthorizedCatalogRefresh,
} from "../src/catalog-refresh.ts";

test("compares scheduled refresh authorization without accepting missing secrets", () => {
  expect(isAuthorizedCatalogRefresh("Bearer scheduled-secret", "scheduled-secret")).toBe(true);
  expect(isAuthorizedCatalogRefresh("Bearer wrong-secret", "scheduled-secret")).toBe(false);
  expect(isAuthorizedCatalogRefresh(undefined, "scheduled-secret")).toBe(false);
  expect(isAuthorizedCatalogRefresh("Bearer scheduled-secret", undefined)).toBe(false);
});

test("dispatches catalog work to the external GitHub worker", async () => {
  const fetcher = vi.fn(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(null, { status: 204 }),
  );
  const dispatcher = new GitHubCatalogRefreshDispatcher({
    fetcher,
    repository: "voltcrash/exora",
    token: "github-token",
  });

  await dispatcher.dispatch();

  expect(fetcher).toHaveBeenCalledOnce();
  const [url, request] = fetcher.mock.calls[0] ?? [undefined, undefined];
  expect(url).toBe("https://api.github.com/repos/voltcrash/exora/dispatches");
  expect(request).toMatchObject({
    body: JSON.stringify({ event_type: "catalog-refresh" }),
    method: "POST",
  });
  expect(new Headers(request?.headers).get("authorization")).toBe("Bearer github-token");
});

test("reports a rejected external dispatch as a failure", async () => {
  const dispatcher = new GitHubCatalogRefreshDispatcher({
    fetcher: async () => new Response(null, { status: 503 }),
    token: "github-token",
  });

  await expect(dispatcher.dispatch()).rejects.toThrow("status 503");
});
