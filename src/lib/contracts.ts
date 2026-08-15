import { z } from "zod";

export const DEFAULT_API_ENDPOINT = "http://localhost:9002/api";

export const proxySchemeSchema = z.enum(["http", "https"]);
const httpUrlSchema = z
  .string()
  .trim()
  .url()
  .refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  }, "URL must use http or https");

export const connectionStateSchema = z.enum([
  "disconnected",
  "connecting",
  "connected",
  "error",
]);
export const connectionModeSchema = z.enum([
  "local",
  "remote-pac",
  "remote-fixed",
]);

export const diagnosticStatusSchema = z.enum([
  "unknown",
  "checking",
  "healthy",
  "unhealthy",
]);
export const traceSignalSchema = z.enum(["on", "off", "unknown"]);

export const DEFAULT_CLOUDFLARE_TRACE_URL =
  "https://www.cloudflare.com/cdn-cgi/trace";

export const extensionDiagnosticsSchema = z.object({
  status: diagnosticStatusSchema,
  checkedAt: z.number().int().nonnegative().nullable(),
  traceUrl: httpUrlSchema,
  warp: traceSignalSchema,
  gateway: traceSignalSchema,
  colo: z.string().nullable(),
  proxyMode: z.string().nullable(),
  levelOfControl: z.string().nullable(),
  error: z.string().nullable(),
});

export const DEFAULT_DIAGNOSTICS: ExtensionDiagnostics = {
  status: "unknown",
  checkedAt: null,
  traceUrl: DEFAULT_CLOUDFLARE_TRACE_URL,
  warp: "unknown",
  gateway: "unknown",
  colo: null,
  proxyMode: null,
  levelOfControl: null,
  error: null,
};

export const extensionStateSchema = z.object({
  state: connectionStateSchema,
  lastError: z.string().nullable(),
  endpoint: httpUrlSchema,
  localMode: z.boolean(),
  localProxyHost: z.string(),
  localProxyPort: z.number().int().min(1).max(65_535).nullable(),
  localProxyScheme: proxySchemeSchema,
  connectedAt: z.number().int().nonnegative().nullable(),
  activeMode: connectionModeSchema.nullable(),
  diagnostics: extensionDiagnosticsSchema.default(DEFAULT_DIAGNOSTICS),
});

const fixedProxySchema = z.object({
  proxy: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().min(1).max(65_535),
    scheme: proxySchemeSchema.default("http"),
  }),
  bypassList: z.array(z.string().trim().min(1)).default(["<local>"]),
});

const pacProxySchema = z.object({
  pacUrl: httpUrlSchema,
});

export const connectRequestSchema = z.object({
  client: z.literal("extension"),
});

export const connectResponseSchema = z.union([
  pacProxySchema,
  fixedProxySchema,
]);

export type ConnectResponse = z.infer<typeof connectResponseSchema>;
export type ProxyScheme = z.infer<typeof proxySchemeSchema>;
export type ConnectionState = z.infer<typeof connectionStateSchema>;
export type ConnectionMode = z.infer<typeof connectionModeSchema>;
export type ExtensionDiagnostics = z.infer<typeof extensionDiagnosticsSchema>;
export type ExtensionState = z.infer<typeof extensionStateSchema>;

export function normalizeApiEndpoint(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("API endpoint must use http or https");
  }

  url.hash = "";
  url.search = "";
  return url.toString().replace(/\/$/, "");
}

export function endpointPermissionPattern(endpoint: string): string {
  const url = new URL(normalizeApiEndpoint(endpoint));
  return `${url.protocol}//${url.host}/*`;
}
