interface ImportMetaEnv {
  readonly VITE_API_ORIGIN?: string;
  readonly VITE_CLOUDFLARE_TRACE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
