"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CircleAlert,
  CircleCheck,
  Clock,
  Globe,
  Loader2,
  Power,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  endpointPermissionPattern,
  extensionStateSchema,
  normalizeApiEndpoint,
  type ConnectionMode,
  type ExtensionDiagnostics,
  type ExtensionState,
} from "@/lib/contracts";
import { Icons } from "@/components/icons";

function runtimeError(response: unknown): string | null {
  if (
    response &&
    typeof response === "object" &&
    "error" in response &&
    typeof response.error === "string"
  ) {
    return response.error;
  }
  return null;
}

function parseExtensionState(response: unknown): ExtensionState {
  const parsed = extensionStateSchema.safeParse(response);
  if (parsed.success) {
    return parsed.data;
  }

  throw new Error(
    runtimeError(response) ?? "The extension background service returned an invalid response",
  );
}

async function sendStateMessage(message: Record<string, unknown>): Promise<ExtensionState> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("Chrome extension APIs are unavailable. Reload the unpacked extension.");
  }
  return parseExtensionState(await chrome.runtime.sendMessage(message));
}

async function sendCommand(message: Record<string, unknown>): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.runtime?.sendMessage) {
    throw new Error("Chrome extension APIs are unavailable. Reload the unpacked extension.");
  }

  const response: unknown = await chrome.runtime.sendMessage(message);
  const error = runtimeError(response);
  if (error) {
    throw new Error(error);
  }
  if (!response || typeof response !== "object" || !("ok" in response) || response.ok !== true) {
    throw new Error("The extension background service returned an invalid command response");
  }
}

async function requestOriginPermission(originPattern: string): Promise<boolean> {
  const alreadyGranted = await chrome.permissions.contains({
    origins: [originPattern],
  });
  return alreadyGranted
    ? true
    : chrome.permissions.request({ origins: [originPattern] });
}

function modeLabel(mode: ConnectionMode | null): string {
  switch (mode) {
    case "local":
      return "Local proxy";
    case "remote-pac":
      return "Remote PAC profile";
    case "remote-fixed":
      return "Remote fixed proxy";
    default:
      return "Not connected";
  }
}

function proxyModeLabel(mode: string | null): string {
  switch (mode) {
    case "fixed_servers":
      return "Fixed servers";
    case "pac_script":
      return "PAC script";
    case "direct":
      return "Direct";
    case "system":
      return "System";
    default:
      return mode ?? "Unknown";
  }
}

function controlLabel(level: string | null): string {
  switch (level) {
    case "controlled_by_this_extension":
      return "SuperTunnel";
    case "controllable_by_this_extension":
      return "Available";
    case "controlled_by_other_extensions":
      return "Another extension";
    case "not_controllable":
      return "Policy locked";
    default:
      return level ?? "Unknown";
  }
}

function traceSignalLabel(signal: ExtensionDiagnostics["warp"]): string {
  return signal === "unknown" ? "Unknown" : signal.toUpperCase();
}

function diagnosticLog(diagnostics: ExtensionDiagnostics): string {
  const signals = [
    `WARP ${traceSignalLabel(diagnostics.warp)}`,
    `Gateway ${traceSignalLabel(diagnostics.gateway)}`,
    diagnostics.colo ? `colo ${diagnostics.colo}` : null,
  ].filter(Boolean);

  return diagnostics.error
    ? `Cloudflare check failed: ${diagnostics.error}`
    : `Cloudflare check passed: ${signals.join(", ")}`;
}

export default function PopupView() {
  const [state, setState] = useState<ExtensionState | null>(null);
  const [endpoint, setEndpoint] = useState("");
  const [token, setToken] = useState("");
  const [tokenChanged, setTokenChanged] = useState(false);
  const [localMode, setLocalMode] = useState(false);
  const [localHost, setLocalHost] = useState("127.0.0.1");
  const [localPort, setLocalPort] = useState("8080");
  const [localScheme, setLocalScheme] = useState<"http" | "https">("http");
  const [logs, setLogs] = useState<string[]>(["SuperTunnel is ready."]);
  const [now, setNow] = useState<number | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [initializationError, setInitializationError] = useState<string | null>(null);

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((previous) => [`[${timestamp}] ${message}`, ...previous].slice(0, 50));
  }, []);

  const applyState = useCallback((nextState: ExtensionState) => {
    setState(nextState);
    setEndpoint(nextState.endpoint);
    setLocalMode(nextState.localMode);
    setLocalHost(nextState.localProxyHost);
    setLocalPort(
      nextState.localProxyPort === null ? "" : String(nextState.localProxyPort),
    );
    setLocalScheme(nextState.localProxyScheme);
    setInitializationError(null);
  }, []);

  const refresh = useCallback(async () => {
    const nextState = await sendStateMessage({ type: "get_state" });
    applyState(nextState);
  }, [applyState]);

  useEffect(() => {
    void sendStateMessage({ type: "get_state" })
      .then((nextState) => {
        applyState(nextState);
        addLog(
          `State restored: ${nextState.state}, ${proxyModeLabel(nextState.diagnostics.proxyMode)}, control ${controlLabel(nextState.diagnostics.levelOfControl)}.`,
        );
        if (nextState.diagnostics.checkedAt) {
          addLog(diagnosticLog(nextState.diagnostics));
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setInitializationError(message);
        addLog(`Unable to read extension state: ${message}`);
      });
  }, [addLog, applyState]);

  useEffect(() => {
    if (state?.state !== "connected") {
      return;
    }
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [state?.state]);

  const uptime = useMemo(() => {
    if (!state?.connectedAt || state.state !== "connected") {
      return "00:00:00";
    }
    const totalSeconds = Math.max(
      0,
      Math.floor(((now ?? state.connectedAt) - state.connectedAt) / 1_000),
    );
    const hours = Math.floor(totalSeconds / 3_600).toString().padStart(2, "0");
    const minutes = Math.floor((totalSeconds % 3_600) / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  }, [now, state]);

  const onConnectToggle = async () => {
    if (isBusy || !state) {
      return;
    }

    setIsBusy(true);
    try {
      if (state.state === "connected") {
        const nextState = await sendStateMessage({ type: "disconnect" });
        applyState(nextState);
        addLog(nextState.state === "disconnected" ? "Proxy disconnected." : nextState.lastError ?? "Disconnect failed.");
        return;
      }

      if (!localMode) {
        const normalizedEndpoint = normalizeApiEndpoint(endpoint);
        const permissionGranted = await requestOriginPermission(
          endpointPermissionPattern(normalizedEndpoint),
        );
        if (!permissionGranted) {
          throw new Error("Permission to contact the API endpoint was denied");
        }
      }

      await sendCommand({ type: "set_endpoint", endpoint });
      await sendCommand({ type: "set_local_mode", enabled: localMode });
      await sendCommand({
        type: "set_local_proxy",
        host: localHost,
        port: localPort ? Number(localPort) : null,
        scheme: localScheme,
      });
      if (tokenChanged) {
        await sendCommand({ type: "set_token", token });
      }

      const tracePermissionGranted = await requestOriginPermission(
        endpointPermissionPattern(state.diagnostics.traceUrl),
      );
      if (!tracePermissionGranted) {
        addLog("Cloudflare trace permission was denied; proxy state will still be applied.");
      }

      setState((current) =>
        current
          ? {
              ...current,
              state: "connecting",
              lastError: null,
              connectedAt: null,
              activeMode: null,
              diagnostics: {
                ...current.diagnostics,
                status: "checking",
                checkedAt: null,
                error: null,
              },
            }
          : current,
      );
      const nextState = await sendStateMessage({ type: "connect" });
      applyState(nextState);
      setToken("");
      setTokenChanged(false);
      if (nextState.state === "connected") {
        addLog(`Connected using ${modeLabel(nextState.activeMode)}.`);
        addLog(diagnosticLog(nextState.diagnostics));
      } else {
        addLog(nextState.lastError ?? "Connection failed.");
      }
    } catch (error) {
      addLog(error instanceof Error ? error.message : String(error));
      await refresh().catch(() => undefined);
    } finally {
      setIsBusy(false);
    }
  };

  const onCheckConnection = async () => {
    if (isBusy || !state) {
      return;
    }

    setIsBusy(true);
    try {
      const permissionGranted = await requestOriginPermission(
        endpointPermissionPattern(state.diagnostics.traceUrl),
      );
      if (!permissionGranted) {
        throw new Error("Permission to contact the Cloudflare trace endpoint was denied");
      }

      addLog("Checking browser traffic through the active proxy...");
      const nextState = await sendStateMessage({ type: "check_connection" });
      applyState(nextState);
      addLog(diagnosticLog(nextState.diagnostics));
    } catch (error) {
      addLog(error instanceof Error ? error.message : String(error));
      await refresh().catch(() => undefined);
    } finally {
      setIsBusy(false);
    }
  };

  const status = state?.state ?? "disconnected";
  const statusInfo = {
    connected: {
      text: "Connected",
      color: "text-green-600",
      icon: <ShieldCheck className="h-5 w-5 text-green-600" />,
      button: "Disconnect",
      variant: "destructive" as const,
    },
    connecting: {
      text: "Connecting",
      color: "text-amber-600",
      icon: <Loader2 className="h-5 w-5 animate-spin text-amber-600" />,
      button: "Connecting",
      variant: "secondary" as const,
    },
    error: {
      text: "Connection error",
      color: "text-red-600",
      icon: <ShieldOff className="h-5 w-5 text-red-600" />,
      button: "Retry",
      variant: "default" as const,
    },
    disconnected: {
      text: "Disconnected",
      color: "text-red-600",
      icon: <ShieldOff className="h-5 w-5 text-red-600" />,
      button: "Connect",
      variant: "default" as const,
    },
  }[status];
  const diagnostics = state?.diagnostics;
  const settingsDisabled =
    isBusy || status === "connected" || status === "connecting";
  const diagnosticInfo = {
    healthy: {
      text: "WARP verified",
      color: "text-green-600",
      icon: <CircleCheck className="h-4 w-4 text-green-600" />,
    },
    checking: {
      text: "Checking traffic",
      color: "text-amber-600",
      icon: <Loader2 className="h-4 w-4 animate-spin text-amber-600" />,
    },
    unhealthy: {
      text: "Cloudflare check failed",
      color: "text-red-600",
      icon: <CircleAlert className="h-4 w-4 text-red-600" />,
    },
    unknown: {
      text: "Traffic not checked",
      color: "text-muted-foreground",
      icon: <Activity className="h-4 w-4 text-muted-foreground" />,
    },
  }[diagnostics?.status ?? "unknown"];

  return (
    <div className="w-full min-w-[320px] bg-background p-4 text-foreground">
      <header className="flex items-center justify-center gap-2 pb-4">
        <Icons.logo className="h-6 w-6 text-primary" />
        <h1 className="text-xl font-bold">SuperTunnel</h1>
      </header>

      <main className="flex flex-col gap-4">
        {initializationError && (
          <Alert variant="destructive">
            <AlertTitle>Extension startup failed</AlertTitle>
            <AlertDescription>{initializationError}</AlertDescription>
          </Alert>
        )}
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-4">
            <div className={`flex items-center gap-2 font-semibold ${statusInfo.color}`}>
              {statusInfo.icon}
              <span>{statusInfo.text}</span>
            </div>
            <Button
              size="lg"
              variant={statusInfo.variant}
              className="h-12 w-full text-base"
              onClick={() => void onConnectToggle()}
              disabled={isBusy || !state || status === "connecting"}
            >
              <Power className="mr-2 h-5 w-5" />
              {statusInfo.button}
            </Button>
            <div className="grid w-full grid-cols-2 gap-2 text-center">
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="flex items-center justify-center gap-1 text-sm font-semibold">
                  <Clock className="h-4 w-4" />
                  {uptime}
                </p>
              </div>
              <div className="rounded-md bg-muted p-2">
                <p className="text-xs text-muted-foreground">Mode</p>
                <p className="flex items-center justify-center gap-1 text-sm font-semibold">
                  <Globe className="h-4 w-4" />
                  {modeLabel(state?.activeMode ?? null)}
                </p>
              </div>
            </div>
            {state?.lastError && (
              <Alert variant="destructive" className="w-full p-3">
                <AlertTitle className="text-xs">Last connection error</AlertTitle>
                <AlertDescription className="text-xs">{state.lastError}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 p-4 pb-2">
            <div>
              <CardTitle className="text-base">Connection diagnostics</CardTitle>
              <div className={`mt-1 flex items-center gap-1.5 text-xs font-medium ${diagnosticInfo.color}`}>
                {diagnosticInfo.icon}
                <span>{diagnosticInfo.text}</span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => void onCheckConnection()}
              disabled={isBusy || !state || status !== "connected"}
              title="Check Cloudflare traffic"
            >
              <RefreshCw className={isBusy ? "animate-spin" : undefined} />
              Check
            </Button>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-2 text-xs">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <dt className="text-muted-foreground">Chrome proxy</dt>
              <dd className="font-medium">{proxyModeLabel(diagnostics?.proxyMode ?? null)}</dd>
              <dt className="text-muted-foreground">Controlled by</dt>
              <dd className="font-medium">{controlLabel(diagnostics?.levelOfControl ?? null)}</dd>
              <dt className="text-muted-foreground">WARP</dt>
              <dd className="font-medium">{traceSignalLabel(diagnostics?.warp ?? "unknown")}</dd>
              <dt className="text-muted-foreground">Gateway</dt>
              <dd className="font-medium">{traceSignalLabel(diagnostics?.gateway ?? "unknown")}</dd>
              <dt className="text-muted-foreground">Cloudflare colo</dt>
              <dd className="font-medium">{diagnostics?.colo ?? "Unknown"}</dd>
              <dt className="text-muted-foreground">Last check</dt>
              <dd className="font-medium">
                {diagnostics?.checkedAt
                  ? new Date(diagnostics.checkedAt).toLocaleTimeString()
                  : "Never"}
              </dd>
            </dl>
            {diagnostics?.error && (
              <Alert variant="destructive" className="p-3">
                <AlertTitle className="text-xs">Diagnostic detail</AlertTitle>
                <AlertDescription className="text-xs">{diagnostics.error}</AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-base">Connection settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4 pt-0">
            <div className="space-y-1">
              <Label htmlFor="endpoint">API endpoint</Label>
              <Input id="endpoint" value={endpoint} onChange={(event) => setEndpoint(event.target.value)} disabled={localMode || settingsDisabled} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="token">Auth token</Label>
              <Input
                id="token"
                type="password"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setTokenChanged(true);
                }}
                placeholder="Optional"
                disabled={settingsDisabled}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="localMode">Use local proxy</Label>
              <Switch id="localMode" checked={localMode} onCheckedChange={setLocalMode} disabled={settingsDisabled} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="col-span-2 space-y-1">
                <Label htmlFor="localHost">Proxy host</Label>
                <Input id="localHost" value={localHost} onChange={(event) => setLocalHost(event.target.value)} disabled={!localMode || settingsDisabled} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="localPort">Port</Label>
                <Input id="localPort" type="number" min="1" max="65535" value={localPort} onChange={(event) => setLocalPort(event.target.value)} disabled={!localMode || settingsDisabled} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="localScheme">Scheme</Label>
                <select id="localScheme" className="h-9 w-full rounded-md border bg-transparent px-2 text-sm" value={localScheme} onChange={(event) => setLocalScheme(event.target.value as "http" | "https")} disabled={!localMode || settingsDisabled}>
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4">
            <CardTitle className="text-base">Activity</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <ScrollArea className="h-[120px] w-full rounded-md border p-2 font-mono text-xs">
              {logs.map((log, index) => (
                <p key={`${log}-${index}`} className="whitespace-pre-wrap leading-snug">{log}</p>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
