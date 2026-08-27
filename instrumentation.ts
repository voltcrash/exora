import { registerOTel } from "@vercel/otel";

export function register(): void {
  registerOTel({
    // The API emits explicit dependency spans with bounded attributes. Vercel's default fetch
    // instrumentation would also attach full NASA/SIMBAD/JPL URLs, including user search terms.
    instrumentations: [],
    serviceName: "exora-api",
  });
}
