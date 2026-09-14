import { loadEnv } from "vite";
import tls from "node:tls";
// Trust Windows/enterprise certificate authorities without disabling TLS checks.
if (typeof tls.setDefaultCACertificates === "function" && typeof tls.getCACertificates === "function") {
  tls.setDefaultCACertificates([...tls.getCACertificates("default"), ...tls.getCACertificates("system")]);
}
const localEnv = loadEnv("development", process.cwd(), "GEMINI_");
for (const [key, value] of Object.entries(localEnv)) process.env[key] ??= value;
process.env.FITNESS_NODE_PREVIEW = "1";
process.argv = [process.execPath, "scripts/run-framework.mjs", "dev"];
await import("./run-framework.mjs");
