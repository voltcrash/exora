import { serve } from "@hono/node-server";
import { app } from "./runtime.ts";

const configuredPort = Number.parseInt(process.env.PORT ?? "8787", 10);
const port = Number.isFinite(configuredPort) ? configuredPort : 8787;
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Exora API listening on http://localhost:${info.port}`);
});

const closeServer = (signal: NodeJS.Signals): void => {
  console.log(`Received ${signal}; closing Exora API.`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
};

process.once("SIGINT", closeServer);
process.once("SIGTERM", closeServer);
