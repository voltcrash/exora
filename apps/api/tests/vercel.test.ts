import { expect, test } from "vite-plus/test";
import vercelApp from "../../../api/index.ts";

test("serves the Hono app through the Vercel entry point", async () => {
  const response = await vercelApp.request("https://exora.test/api/health");

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ service: "exora-api", status: "ok" });
});
