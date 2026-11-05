import { serve } from "@hono/node-server";
import { createRuntimeApp } from "./runtime.ts";

const app = createRuntimeApp();
const configuredPort = Number.parseInt(process.env.PORT ?? "8787", 10);
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Exora API listening on http://localhost:${info.port}`);
});

let closing = false;
const closeServer = (signal: NodeJS.Signals): void => {
  if (closing) return;
  closing = true;
  const deadline = setTimeout(() => {
    if ("closeAllConnections" in server) server.closeAllConnections();
  }, 10_000);
  deadline.unref();
  console.log(`Received ${signal}; closing Exora API.`);
  server.close((error) => {
    clearTimeout(deadline);
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);
