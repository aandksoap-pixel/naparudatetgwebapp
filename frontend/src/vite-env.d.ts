/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Базовый URL backend без завершающего слэша. */
  readonly VITE_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
