/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WATCHMAKER_CATALOG_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
