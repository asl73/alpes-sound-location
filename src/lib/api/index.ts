import { demoApi } from './demo'
import { supabaseApi } from './supabase'
import type { Api } from './types'

// En mode démo (__DEMO__), seule l'implémentation locale est incluse dans le build.
export const api: Api = __DEMO__ ? demoApi : supabaseApi
export type { Api } from './types'
