import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { seoPrerender } from './scripts/seo-prerender'

// Deux modes de build :
//  - normal ("npm run build")      : le vrai site, branché sur Supabase et Stripe
//  - démo   ("npm run build:demo") : un aperçu autonome, sans serveur, avec des données d'exemple
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo'
  return {
    // Vrai site : chaque page publique reçoit son propre en-tête (titre, description) et le plan du site est généré.
    plugins: [react(), tailwindcss(), ...(demo ? [] : [seoPrerender()])],
    // Sortie en ASCII pur : le code reste valide quel que soit l'encodage de la page hôte.
    esbuild: { charset: 'ascii' },
    define: {
      __DEMO__: JSON.stringify(demo),
    },
    build: demo
      ? {
          outDir: 'dist-demo',
          assetsInlineLimit: 100_000_000,
          cssCodeSplit: false,
          modulePreload: false,
          rollupOptions: { output: { inlineDynamicImports: true } },
        }
      : { outDir: 'dist', sourcemap: false },
  }
})
