/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base path for API calls; defaults to "/api" (same origin, proxied). */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
