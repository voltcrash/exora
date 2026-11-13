import { createRuntimeApp } from "./runtime.ts";

export default createRuntimeApp({ trustedClientIpHeader: "x-vercel-forwarded-for" });
