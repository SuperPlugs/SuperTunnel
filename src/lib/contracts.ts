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
