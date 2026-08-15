import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isAuthorized, resolveServerConfig } from "./server-config";

const environmentVariables = [
  "SUPERTUNNEL_PAC_URL",
  "SUPERTUNNEL_PROXY_HOST",
  "SUPERTUNNEL_PROXY_PORT",
  "SUPERTUNNEL_PROXY_SCHEME",
  "SUPERTUNNEL_BYPASS_LIST",
  "SUPERTUNNEL_API_TOKEN",
] as const;

const originalEnvironment = Object.fromEntries(
  environmentVariables.map((name) => [name, process.env[name]]),
);

beforeEach(() => {
  environmentVariables.forEach((name) => delete process.env[name]);
});

afterEach(() => {
  environmentVariables.forEach((name) => {
    const originalValue = originalEnvironment[name];
    if (originalValue === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalValue;
    }
  });
});

describe("server configuration", () => {
  it("reports an unconfigured controller", () => {
    const config = resolveServerConfig();
    expect(config.status.ready).toBe(false);
    expect(config.profile).toBeNull();
  });

  it("builds a fixed proxy profile", () => {
    process.env.SUPERTUNNEL_PROXY_HOST = "proxy.internal";
    process.env.SUPERTUNNEL_PROXY_PORT = "8443";
    process.env.SUPERTUNNEL_PROXY_SCHEME = "https";
    process.env.SUPERTUNNEL_BYPASS_LIST = "<local>,localhost";

    const config = resolveServerConfig();
    expect(config.status).toMatchObject({
      ready: true,
      mode: "fixed",
      target: "https://proxy.internal:8443",
    });
    expect(config.profile).toMatchObject({
      proxy: { host: "proxy.internal", port: 8443, scheme: "https" },
      bypassList: ["<local>", "localhost"],
    });
  });

  it("gives PAC configuration precedence", () => {
    process.env.SUPERTUNNEL_PAC_URL = "https://proxy.example.com/proxy.pac";
    process.env.SUPERTUNNEL_PROXY_HOST = "ignored.internal";
    process.env.SUPERTUNNEL_PROXY_PORT = "8080";

    const config = resolveServerConfig();
    expect(config.status.mode).toBe("pac");
    expect(config.profile).toEqual({
      pacUrl: "https://proxy.example.com/proxy.pac",
    });
  });

  it("validates bearer tokens", () => {
    process.env.SUPERTUNNEL_API_TOKEN = "shared-secret";
    expect(isAuthorized("Bearer shared-secret")).toBe(true);
    expect(isAuthorized("Bearer wrong-secret")).toBe(false);
    expect(isAuthorized(null)).toBe(false);
  });
});
