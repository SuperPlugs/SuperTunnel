import { timingSafeEqual } from "node:crypto";
import {
  connectResponseSchema,
  type ConnectResponse,
  type ProxyScheme,
} from "./contracts";

export interface ServerStatus {
  ready: boolean;
  mode: "pac" | "fixed" | null;
  target: string | null;
  authRequired: boolean;
  error: string | null;
}

interface ResolvedServerConfig {
  status: ServerStatus;
  profile: ConnectResponse | null;
}

function value(name: string): string | undefined {
  const result = process.env[name]?.trim();
  return result ? result : undefined;
}

export function resolveServerConfig(): ResolvedServerConfig {
  const pacUrl = value("SUPERTUNNEL_PAC_URL");
  const proxyHost = value("SUPERTUNNEL_PROXY_HOST");
  const proxyPort = value("SUPERTUNNEL_PROXY_PORT");
  const proxyScheme = (value("SUPERTUNNEL_PROXY_SCHEME") ?? "http") as ProxyScheme;
  const authRequired = Boolean(value("SUPERTUNNEL_API_TOKEN"));

  const candidate: unknown = pacUrl
    ? { pacUrl }
    : proxyHost && proxyPort
      ? {
          proxy: {
            host: proxyHost,
            port: Number(proxyPort),
            scheme: proxyScheme,
          },
          bypassList: (value("SUPERTUNNEL_BYPASS_LIST") ?? "<local>")
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
        }
      : null;

  if (!candidate) {
    return {
      profile: null,
      status: {
        ready: false,
        mode: null,
        target: null,
        authRequired,
        error: "Set SUPERTUNNEL_PAC_URL or both SUPERTUNNEL_PROXY_HOST and SUPERTUNNEL_PROXY_PORT.",
      },
    };
  }

  const parsed = connectResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    return {
      profile: null,
      status: {
        ready: false,
        mode: null,
        target: null,
        authRequired,
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
      },
    };
  }

  if ("pacUrl" in parsed.data) {
    return {
      profile: parsed.data,
      status: {
        ready: true,
        mode: "pac",
        target: parsed.data.pacUrl,
        authRequired,
        error: null,
      },
    };
  }

  return {
    profile: parsed.data,
    status: {
      ready: true,
      mode: "fixed",
      target: `${parsed.data.proxy.scheme}://${parsed.data.proxy.host}:${parsed.data.proxy.port}`,
      authRequired,
      error: null,
    },
  };
}

export function isAuthorized(authorizationHeader: string | null): boolean {
  const expected = value("SUPERTUNNEL_API_TOKEN");
  if (!expected) {
    return true;
  }

  const supplied = authorizationHeader?.startsWith("Bearer ")
    ? authorizationHeader.slice("Bearer ".length).trim()
    : "";
  const expectedBuffer = Buffer.from(expected);
  const suppliedBuffer = Buffer.from(supplied);

  return (
    expectedBuffer.length === suppliedBuffer.length &&
    timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}
