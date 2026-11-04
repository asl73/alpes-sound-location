/// <reference types="vite/client" />

declare const __DEMO__: boolean

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  /** Clé publique du projet Supabase (sb_publishable_…). */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string
  /** Ancien nom de la clé publique (projets Supabase créés avant 2026). */
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_SITE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
