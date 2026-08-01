/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPER_ADMIN_EMAIL: string
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
