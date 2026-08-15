import { describe, expect, it } from "vitest";
import {
  connectResponseSchema,
  endpointPermissionPattern,
  extensionStateSchema,
  normalizeApiEndpoint,
} from "./contracts";

describe("API endpoint helpers", () => {
  it("normalizes trailing slashes and removes query fragments", () => {
    expect(normalizeApiEndpoint("https://api.example.com/v1/?debug=1#status")).toBe(
      "https://api.example.com/v1",
    );
  });

  it("rejects unsupported URL protocols", () => {
    expect(() => normalizeApiEndpoint("file:///tmp/proxy")).toThrow(
      "must use http or https",
    );
  });

  it("creates a Chrome origin permission pattern", () => {
    expect(endpointPermissionPattern("https://api.example.com/v1")).toBe(
      "https://api.example.com/*",
    );
  });
});

describe("connection response validation", () => {
  it("accepts a valid fixed proxy profile", () => {
    const result = connectResponseSchema.safeParse({
      proxy: { host: "127.0.0.1", port: 8080, scheme: "http" },
      bypassList: ["<local>"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid proxy ports", () => {
    const result = connectResponseSchema.safeParse({
      proxy: { host: "127.0.0.1", port: 70_000, scheme: "http" },
    });
    expect(result.success).toBe(false);
  });
});

describe("extension state validation", () => {
  it("accepts a complete extension state", () => {
    const result = extensionStateSchema.safeParse({
      state: "connected",
      lastError: null,
      endpoint: "http://localhost:9002/api",
      localMode: true,
      localProxyHost: "127.0.0.1",
      localProxyPort: 40000,
      localProxyScheme: "http",
      connectedAt: Date.now(),
      activeMode: "local",
    });

    expect(result.success).toBe(true);
  });

  it("rejects error envelopes returned instead of state", () => {
    const result = extensionStateSchema.safeParse({
      ok: false,
      error: "Background worker failed",
    });

    expect(result.success).toBe(false);
  });

  it("provides diagnostics defaults for older stored state", () => {
    const result = extensionStateSchema.parse({
      state: "disconnected",
      lastError: null,
      endpoint: "http://localhost:9002/api",
      localMode: false,
      localProxyHost: "127.0.0.1",
      localProxyPort: 8080,
      localProxyScheme: "http",
      connectedAt: null,
      activeMode: null,
    });

    expect(result.diagnostics).toMatchObject({
      status: "unknown",
      warp: "unknown",
      gateway: "unknown",
      traceUrl: "https://www.cloudflare.com/cdn-cgi/trace",
    });
  });
});
