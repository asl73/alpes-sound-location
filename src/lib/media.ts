// Photos livrées avec le site : public/photos/nom.jpg (1 600 px de côté maximum)
// et public/photos/nom-800.jpg (800 px de large), sans métadonnées.
// Les photos ajoutées depuis l'administration sont des adresses complètes (stockage Supabase).

const BUNDLED = /^\/photos\/[a-z0-9-]+\.jpg$/

/** Adresse à donner à <img>. Dans l'aperçu (un seul fichier), les photos sont publiées à côté de la page. */
export function media(src: string): string {
  return __DEMO__ && src.startsWith('/') ? src.slice(1) : src
}

/** Variantes 800 px / grande taille des photos livrées avec le site, pour que le navigateur charge la plus légère qui suffit. */
export function mediaSrcSet(src: string): string | undefined {
  if (!BUNDLED.test(src)) return undefined
  return `${media(src.replace(/\.jpg$/, '-800.jpg'))} 800w, ${media(src)} 1200w`
}
