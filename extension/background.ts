import {
  connectResponseSchema,
  DEFAULT_API_ENDPOINT,
  extensionStateSchema,
  normalizeApiEndpoint,
  type ConnectionMode,
  type ConnectionState,
  type ExtensionState,
} from "../src/lib/contracts";

type StoredState = ExtensionState;

const DEFAULT_ENDPOINT = normalizeApiEndpoint(
  import.meta.env.VITE_API_ORIGIN || DEFAULT_API_ENDPOINT,
);

const DEFAULT_STATE: StoredState = {
  state: "disconnected",
  lastError: null,
  endpoint: DEFAULT_ENDPOINT,
  localMode: false,
  localProxyHost: "127.0.0.1",
  localProxyPort: 8080,
  localProxyScheme: "http",
  connectedAt: null,
  activeMode: null,
};

async function readState(): Promise<StoredState> {
  const stored = await chrome.storage.local.get(
    DEFAULT_STATE as unknown as Record<string, unknown>,
  );
  const parsed = extensionStateSchema.safeParse(stored);
  if (parsed.success) {
    return parsed.data;
  }

  await chrome.storage.local.set(DEFAULT_STATE);
  return DEFAULT_STATE;
}

async function writeState(partial: Partial<StoredState>): Promise<void> {
  await chrome.storage.local.set(partial);
}

async function readToken(): Promise<string | undefined> {
  const stored = await chrome.storage.session.get("token");
  return typeof stored.token === "string" && stored.token.length > 0
    ? stored.token
    : undefined;
}

async function writeToken(token: string): Promise<void> {
  const normalized = token.trim();
  if (normalized) {
    await chrome.storage.session.set({ token: normalized });
  } else {
    await chrome.storage.session.remove("token");
  }
}

async function setBadge(state: ConnectionState): Promise<void> {
  const badges: Record<ConnectionState, { text: string; color: string }> = {
    disconnected: { text: "", color: "#9ca3af" },
    connecting: { text: "...", color: "#f59e0b" },
    connected: { text: "ON", color: "#16a34a" },
    error: { text: "!", color: "#dc2626" },
  };
  const badge = badges[state];

  await Promise.all([
    chrome.action.setBadgeText({ text: badge.text }),
    chrome.action.setBadgeBackgroundColor({ color: badge.color }),
  ]);
}

function proxySettingsSet(value: chrome.proxy.ProxyConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.set({ value, scope: "regular" }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function proxySettingsClear(): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.clear({ scope: "regular" }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve();
    });
  });
}

function proxySettingsGet(): Promise<
  chrome.types.ChromeSettingGetResult<chrome.proxy.ProxyConfig>
> {
  return new Promise((resolve, reject) => {
    chrome.proxy.settings.get({ incognito: false }, (details) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(new Error(error.message));
        return;
      }
      resolve(details);
    });
  });
}

function validateLocalProxy(state: StoredState): void {
  if (!state.localProxyHost.trim()) {
    throw new Error("Local proxy host is required");
  }
  if (
    state.localProxyPort === null ||
    !Number.isInteger(state.localProxyPort) ||
    state.localProxyPort < 1 ||
    state.localProxyPort > 65_535
  ) {
    throw new Error("Local proxy port must be between 1 and 65535");
  }
}

async function fetchConnectionProfile(
  endpoint: string,
  token: string | undefined,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(`${endpoint}/connect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ client: "extension" }),
      signal: controller.signal,
    });
    const body = await response.json().catch(() => null);

    if (!response.ok) {
      const detail =
        body && typeof body === "object" && "error" in body
          ? String(body.error)
          : `HTTP ${response.status}`;
      throw new Error(`Connection API rejected the request: ${detail}`);
    }

    return body;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Connection API timed out after 15 seconds");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function connectProxy(): Promise<StoredState> {
  await writeState({ state: "connecting", lastError: null });
  await setBadge("connecting");

  try {
    const state = await readState();
    let proxyConfig: chrome.proxy.ProxyConfig;
    let activeMode: ConnectionMode;

    if (state.localMode) {
      validateLocalProxy(state);
      proxyConfig = {
        mode: "fixed_servers",
        rules: {
          singleProxy: {
            scheme: state.localProxyScheme,
            host: state.localProxyHost.trim(),
            port: state.localProxyPort!,
          },
          bypassList: ["<local>"],
        },
      };
      activeMode = "local";
    } else {
      const endpoint = normalizeApiEndpoint(state.endpoint);
      const response = await fetchConnectionProfile(endpoint, await readToken());
      const parsed = connectResponseSchema.safeParse(response);

      if (!parsed.success) {
        throw new Error("Connection API returned an invalid proxy profile");
      }

      if ("pacUrl" in parsed.data) {
        proxyConfig = {
          mode: "pac_script",
          pacScript: { url: parsed.data.pacUrl },
        };
        activeMode = "remote-pac";
      } else {
        proxyConfig = {
          mode: "fixed_servers",
          rules: {
            singleProxy: parsed.data.proxy,
            bypassList: parsed.data.bypassList,
          },
        };
        activeMode = "remote-fixed";
      }
    }

    await proxySettingsSet(proxyConfig);
    await writeState({
      state: "connected",
      lastError: null,
      connectedAt: Date.now(),
      activeMode,
    });
    await setBadge("connected");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeState({
      state: "error",
      lastError: message,
      connectedAt: null,
      activeMode: null,
    });
    await setBadge("error");
  }

  return readState();
}

async function disconnectProxy(): Promise<StoredState> {
  try {
    await proxySettingsClear();
    await writeState({
      state: "disconnected",
      lastError: null,
      connectedAt: null,
      activeMode: null,
    });
    await setBadge("disconnected");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeState({ state: "error", lastError: message });
    await setBadge("error");
  }

  return readState();
}

async function reconcileProxyState(): Promise<StoredState> {
  const state = await readState();
  const settings = await proxySettingsGet();
  const proxyMode = (settings.value as { mode?: string } | undefined)?.mode;
  const controlledBySuperTunnel =
    settings.levelOfControl === "controlled_by_this_extension" &&
    proxyMode !== "direct" &&
    proxyMode !== "system";

  if (controlledBySuperTunnel) {
    const nextState: StoredState = {
      ...state,
      state: "connected",
      lastError: null,
      connectedAt: state.connectedAt ?? Date.now(),
      activeMode: state.activeMode ?? (proxyMode === "pac_script" ? "remote-pac" : "remote-fixed"),
    };
    await writeState(nextState);
    await setBadge("connected");
    return nextState;
  }

  if (state.state === "connected" || state.state === "connecting") {
    const nextState: StoredState = {
      ...state,
      state: "disconnected",
      connectedAt: null,
      activeMode: null,
    };
    await writeState(nextState);
    await setBadge("disconnected");
    return nextState;
  }

  await setBadge(state.state);
  return state;
}

async function initialize(): Promise<void> {
  const stored = await chrome.storage.local.get("endpoint");
  if (typeof stored.endpoint !== "string") {
    await chrome.storage.local.set(DEFAULT_STATE);
  }
  await reconcileProxyState();
}

async function initializeSafely(): Promise<void> {
  try {
    await initialize();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await writeState({
      state: "error",
      lastError: `Extension initialization failed: ${message}`,
      connectedAt: null,
      activeMode: null,
    }).catch(() => undefined);
    await setBadge("error").catch(() => undefined);
  }
}

let operationQueue: Promise<void> = Promise.resolve();

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const result = operationQueue.then(operation, operation);
  operationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function handleMessage(request: unknown): Promise<unknown> {
  if (!request || typeof request !== "object" || !("type" in request)) {
    return { ok: false, error: "Invalid request" };
  }

  const message = request as Record<string, unknown>;
  switch (message.type) {
    case "get_state":
      return reconcileProxyState();
    case "set_token":
      await writeToken(typeof message.token === "string" ? message.token : "");
      return { ok: true };
    case "set_endpoint": {
      if (typeof message.endpoint !== "string") {
        return { ok: false, error: "API endpoint is required" };
      }
      try {
        await writeState({ endpoint: normalizeApiEndpoint(message.endpoint) });
        return { ok: true };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    case "set_local_mode":
      await writeState({ localMode: Boolean(message.enabled) });
      return { ok: true };
    case "set_local_proxy":
      await writeState({
        localProxyHost:
          typeof message.host === "string" ? message.host.trim() : "",
        localProxyPort:
          typeof message.port === "number" && Number.isFinite(message.port)
            ? message.port
            : null,
        localProxyScheme: message.scheme === "https" ? "https" : "http",
      });
      return { ok: true };
    case "connect":
      return enqueue(connectProxy);
    case "disconnect":
      return enqueue(disconnectProxy);
    default:
      return { ok: false, error: "Unknown request" };
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void initializeSafely();
});

chrome.runtime.onStartup.addListener(() => {
  void initializeSafely();
});

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  handleMessage(request).then(
    sendResponse,
    (error: unknown) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  );
  return true;
});

void initializeSafely();
