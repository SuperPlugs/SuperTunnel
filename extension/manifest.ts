import { endpointPermissionPattern } from "../src/lib/contracts.js";

export function createManifest(apiEndpoint: string) {
  return {
    manifest_version: 3 as const,
    name: "SuperTunnel",
    version: "0.1.0",
    description: "Browser proxy controller for SuperTunnel.",
    action: {
      default_popup: "extension/popup.html",
      default_title: "SuperTunnel",
    },
    background: {
      service_worker: "extension/background.ts",
      type: "module" as const,
    },
    permissions: ["proxy", "storage"],
    host_permissions: [endpointPermissionPattern(apiEndpoint)],
    optional_host_permissions: ["http://*/*", "https://*/*"],
    icons: {
      16: "extension/icons/16.png",
      32: "extension/icons/32.png",
      48: "extension/icons/48.png",
      128: "extension/icons/128.png",
    },
  };
}


