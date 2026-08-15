import { describe, expect, it } from "vitest";
import { assessCloudflareTrace, parseCloudflareTrace } from "./cloudflare-trace";

describe("Cloudflare trace diagnostics", () => {
  it("parses WARP and Gateway signals", () => {
    const trace = parseCloudflareTrace("warp=on\ngateway=off\ncolo=DEL\n");

    expect(trace).toEqual({ warp: "on", gateway: "off", colo: "DEL" });
    expect(assessCloudflareTrace(trace)).toBeNull();
  });

  it("reports when traffic is reachable without WARP", () => {
    const trace = parseCloudflareTrace("warp=off\ngateway=off\ncolo=SFO\n");

    expect(assessCloudflareTrace(trace)).toBe(
      "Cloudflare trace reached the internet, but WARP is off",
    );
  });

  it("handles incomplete trace responses", () => {
    const trace = parseCloudflareTrace("colo=DEL\n");

    expect(trace).toEqual({ warp: "unknown", gateway: "unknown", colo: "DEL" });
    expect(assessCloudflareTrace(trace)).toBe(
      "Cloudflare trace response did not include a WARP status",
    );
  });
});
