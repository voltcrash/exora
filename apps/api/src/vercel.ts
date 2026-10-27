import { waitUntil } from "@vercel/functions";
import { createRuntimeApp } from "./runtime.ts";

export default createRuntimeApp({ waitUntil });
