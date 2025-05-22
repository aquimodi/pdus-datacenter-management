/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API1_URL: string;
  readonly VITE_API2_URL: string;
  readonly VITE_API1_USERNAME: string;
  readonly VITE_API1_PASSWORD: string;
  readonly VITE_DEFAULT_REFRESH_INTERVAL: string;
  readonly VITE_SQL_USER: string;
  readonly VITE_SQL_PASSWORD: string;
  readonly VITE_SQL_SERVER: string;
  readonly VITE_SQL_DATABASE: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}