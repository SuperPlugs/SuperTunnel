import { describe, expect, it } from "vitest";
import { createManifest } from "../../extension/manifest";

describe("Extension Manifest Generator", () => {
  it("generates a valid Chrome Manifest V3", () => {
    const manifest = createManifest("http://localhost:9002/api", "chrome");

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("SuperTunnel");
    expect(manifest.background).toEqual({
      service_worker: "extension/background.ts",
      type: "module",
    });
    expect(manifest.permissions).toContain("proxy");
    expect(manifest.permissions).toContain("storage");
    expect(manifest.host_permissions).toContain("http://localhost:9002/*");
    expect(manifest).not.toHaveProperty("browser_specific_settings");
  });

  it("generates a valid Firefox Manifest V3 with gecko settings", () => {
    const manifest = createManifest("https://example.com/api", "firefox", {
      firefoxId: "custom-id@supertunnel.local",
    });

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe("SuperTunnel");
    expect(manifest.background).toEqual({
      scripts: ["background.js"],
      type: "module",
    });
    expect(manifest.permissions).toContain("proxy");
    expect(manifest.permissions).toContain("storage");
    expect(manifest.host_permissions).toContain("https://example.com/*");
    expect(manifest.browser_specific_settings?.gecko).toEqual({
      id: "custom-id@supertunnel.local",
      strict_min_version: "128.0",
      data_collection_permissions: {
        required: ["none"],
      },
    });
  });
});
