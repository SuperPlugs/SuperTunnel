import type { ExtensionDiagnostics } from "./contracts";

export interface CloudflareTrace {
  warp: ExtensionDiagnostics["warp"];
  gateway: ExtensionDiagnostics["gateway"];
  colo: string | null;
}

function signal(value: string | undefined): CloudflareTrace["warp"] {
  if (value === "on" || value === "off") {
    return value;
  }
  return "unknown";
}

export function parseCloudflareTrace(body: string): CloudflareTrace {
  const fields = new Map<string, string>();

  for (const line of body.split(/\r?\n/)) {
    const separator = line.indexOf("=");
    if (separator < 1) {
      continue;
    }
    fields.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }

  const colo = fields.get("colo");
  return {
    warp: signal(fields.get("warp")),
    gateway: signal(fields.get("gateway")),
    colo: colo ? colo : null,
  };
}

export function assessCloudflareTrace(trace: CloudflareTrace): string | null {
  if (trace.warp === "on") {
    return null;
  }
  if (trace.warp === "off") {
    return "Cloudflare trace reached the internet, but WARP is off";
  }
  return "Cloudflare trace response did not include a WARP status";
}
