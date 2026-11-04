import { Link } from 'react-router'
import { useTitle } from '../../components/layout'

export default function NotFound() {
  useTitle('Page introuvable')
  return (
    <div className="wrap py-24 text-center">
      <p className="display text-[96px] text-or">404</p>
      <h1 className="mt-2 text-2xl font-bold">Cette page n’existe pas</h1>
      <p className="mt-2 text-muted">Le lien est peut-être ancien, ou l’article n’est plus proposé.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link to="/materiel" className="btn btn-primary">
          Voir le matériel
        </Link>
        <Link to="/" className="btn btn-outline">
          Accueil
        </Link>
      </div>
    </div>
  )
}
