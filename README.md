# SuperTunnel

SuperTunnel is an open-source browser proxy controller. The Chrome extension applies a PAC script or fixed proxy through the Manifest V3 `chrome.proxy` API, while the included Next.js service exposes the connection profile consumed by the extension.

SuperTunnel affects browser traffic only. It does not install an operating-system VPN driver or create a VPN tunnel by itself.

## Features

- Manifest V3 Chrome/Chromium extension
- Local fixed-proxy mode without a backend
- Remote PAC or fixed-proxy profiles from a validated API
- Optional bearer-token authentication
- Runtime permission requests for custom API origins
- Persisted configuration and connection-state reconciliation
- Cloudflare trace diagnostics showing WARP, Gateway, colo, and Chrome proxy control
- Strict TypeScript, ESLint, production builds, and GitHub Actions CI

## Architecture

```text
Extension popup
    -> chrome.runtime messages
    -> background service worker
        -> local proxy configuration
        -> or POST /api/connect
    -> chrome.proxy.settings
    -> Cloudflare trace health check

Next.js service
    -> environment-backed proxy profile
    -> GET /api/status
    -> POST /api/connect
```

## Requirements

- Node.js 20.19 or newer
- pnpm 10.29.1
- Chrome or another Chromium browser with Manifest V3 proxy support
- A reachable HTTP, HTTPS, or PAC proxy for actual traffic forwarding

## Setup

```bash
pnpm install
```

Create a local environment file from the tracked example:

```bash
cp .env.example .env.local
```

On PowerShell:

```powershell
Copy-Item .env.example .env.local
```

Configure either `SUPERTUNNEL_PAC_URL` or both `SUPERTUNNEL_PROXY_HOST` and `SUPERTUNNEL_PROXY_PORT`.

## Run the Controller API

```bash
pnpm dev
```

The status dashboard and API run at `http://localhost:9002`:

- `GET /api/status`
- `POST /api/connect`

## Build the Extension

### Chrome / Chromium Extension

The default development endpoint is `http://localhost:9002/api`. Override it with `VITE_API_ORIGIN` when building for another deployment.

```bash
pnpm build:extension
```

Load `dist-extension/` from `chrome://extensions` using **Load unpacked**.

### Firefox Add-on & Mozilla Packaging

Build the Firefox WebExtension and create a release package (`.zip` and `.xpi`) ready to upload to Mozilla Add-ons (AMO):

```bash
pnpm package:firefox
```

This generates:
- **`dist-firefox/`** – Unpacked Firefox extension directory.
- **`dist-firefox/supertunnel-firefox.zip`** – Complete ZIP package for [addons.mozilla.org (AMO)](https://addons.mozilla.org/).
- **`dist-firefox/supertunnel-firefox.xpi`** – Direct Firefox Add-on bundle.

#### Testing Locally in Firefox
1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `dist-firefox/manifest.json` or `dist-firefox/supertunnel-firefox.zip`.

#### Publishing to Mozilla Add-ons (AMO)
1. Sign in to the [Mozilla Add-on Developer Hub](https://addons.mozilla.org/developers/addon/submit/upload-listed).
2. Upload `dist-firefox/supertunnel-firefox.zip`.
3. If needed, customize the Gecko extension ID before building:
   ```bash
   FIREFOX_EXTENSION_ID="your-extension-id@example.com" pnpm package:firefox
   ```

---

The popup supports two connection modes:

- **Remote API:** obtains a validated PAC or fixed-proxy profile from `{API_ENDPOINT}/connect`.
- **Local proxy:** directly applies the host, port, and scheme entered in the popup.

After applying the browser proxy setting, the extension checks the configured
Cloudflare trace URL. The diagnostics panel separates browser proxy control from
traffic verification and reports WARP, Gateway, Cloudflare colo, and the last
check time. The browser may request access to the trace origin the first time the
check runs.

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_API_ORIGIN` | API base URL embedded in the extension build |
| `VITE_CLOUDFLARE_TRACE_URL` | Cloudflare trace URL used to verify browser traffic |
| `FIREFOX_EXTENSION_ID` | Custom Gecko Add-on ID for Firefox (`supertunnel@supertunnel.local` by default) |
| `SUPERTUNNEL_PAC_URL` | PAC script URL returned to clients |
| `SUPERTUNNEL_PROXY_HOST` | Fixed proxy hostname or IP address |
| `SUPERTUNNEL_PROXY_PORT` | Fixed proxy port from 1 to 65535 |
| `SUPERTUNNEL_PROXY_SCHEME` | `http` or `https` |
| `SUPERTUNNEL_BYPASS_LIST` | Comma-separated browser proxy bypass rules |
| `SUPERTUNNEL_API_TOKEN` | Optional bearer token required by `/api/connect` |

PAC configuration takes precedence when both PAC and fixed-proxy variables are present.

## API Contract

Request:

```http
POST /api/connect
Content-Type: application/json
Authorization: Bearer <token>

{"client":"extension"}
```

PAC response:

```json
{"pacUrl":"https://proxy.example.com/proxy.pac"}
```

Fixed proxy response:

```json
{
  "proxy": {"host":"127.0.0.1","port":8080,"scheme":"http"},
  "bypassList": ["<local>"]
}
```

## Development Commands

```bash
pnpm dev                 # Next.js development server on port 9002
pnpm dev:extension       # Watch a self-contained extension build
pnpm lint                # ESLint
pnpm typecheck           # TypeScript without emit
pnpm test                # Vitest unit tests
pnpm build               # Next.js production build
pnpm build:extension     # Chrome Manifest V3 production bundle
pnpm build:firefox       # Firefox Manifest V3 production bundle
pnpm package:firefox     # Build and package Firefox Add-on (.zip and .xpi for AMO)
pnpm package             # Build all browser extension bundles and packages
pnpm check               # Complete local verification pipeline
```

`pnpm dev:extension` watches and rebuilds the self-contained MV3 bundle in
`dist-extension/`. Load that directory as an unpacked extension and click
Chrome's extension reload button after a change. This keeps the installed
extension independent of a development WebSocket and works with Chrome's
extension security policy.

## Security

- Use HTTPS for production API and PAC endpoints.
- Set `SUPERTUNNEL_API_TOKEN` for any controller exposed beyond localhost.
- The extension stores the bearer token in `chrome.storage.session`, not persistent local storage.
- Custom API origins require an explicit Chrome permission prompt.
- Report vulnerabilities privately using [SECURITY.md](SECURITY.md).

## Contributing

Focused issues and pull requests are welcome. Run `pnpm check` before submitting changes and include browser-level verification for proxy behavior. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT. See [LICENSE](LICENSE).
