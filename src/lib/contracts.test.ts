import { describe, expect, it } from "vitest";
import {
  connectResponseSchema,
  endpointPermissionPattern,
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
