import { endpointPermissionPattern } from "../src/lib/contracts.js";

export type ExtensionTarget = "chrome" | "firefox";

export interface ManifestOptions {
  firefoxId?: string;
}

export interface ExtensionManifest {
  manifest_version: 3;
  name: string;
  version: string;
  description: string;
  action: {
    default_popup: string;
    default_title: string;
  };
  background:
    | {
        service_worker: string;
        type: "module";
      }
    | {
        scripts: string[];
        type: "module";
      };
  permissions: string[];
  host_permissions: string[];
  optional_host_permissions: string[];
  icons: Record<string, string>;
  browser_specific_settings?: {
    gecko: {
      id: string;
      strict_min_version: string;
    };
  };
}

export function createManifest(
  apiEndpoint: string,
  target: ExtensionTarget = "chrome",
  options: ManifestOptions = {},
): ExtensionManifest {
  const isFirefox = target === "firefox";
  const firefoxId =
    options.firefoxId ||
    process.env.FIREFOX_EXTENSION_ID ||
    "supertunnel@supertunnel.local";

  const baseManifest = {
    manifest_version: 3 as const,
    name: "SuperTunnel",
    version: "0.1.0",
    description: "Browser proxy controller for SuperTunnel.",
    action: {
      default_popup: "extension/popup.html",
      default_title: "SuperTunnel",
    },
    background: isFirefox
      ? {
          scripts: ["background.js"],
          type: "module" as const,
        }
      : {
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

  if (isFirefox) {
    return {
      ...baseManifest,
      browser_specific_settings: {
        gecko: {
          id: firefoxId,
          strict_min_version: "115.0",
        },
      },
    };
  }

  return baseManifest;
}



