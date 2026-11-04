import { Mail, MapPin, Phone } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { PageHead } from '../../components/layout'
import { CopyText, Field, Notice, Spinner } from '../../components/ui'
import { api } from '../../lib/api'
import { eur, phoneHref } from '../../lib/format'
import { useAuth, useCatalog } from '../../lib/store'

// ------------------------------------------------------------------ Prestations

const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1)

export function ServicesPage() {
  const { zones, services, settings, products, packs } = useCatalog()
  // Caution plus élevée pour certains articles ou packs (XDJ-RR, Pack Mariage…)
  const special = Math.max(0, ...products.map((p) => p.caution ?? 0), ...packs.map((k) => k.caution ?? 0))
  const install = services.find((s) => s.id === 'installation')
  const tech = services.find((s) => s.id === 'technicien')
  const b = settings.booking
  return (
    <>
      <PageHead kicker="Prestations" title="Livraison et installation">
        Venez chercher le matériel à {settings.company.city}, ou laissez-nous le livrer, l’installer et le régler pour vous.
      </PageHead>

      <div className="wrap mt-12 grid gap-12 lg:grid-cols-[1.2fr_1fr]">
        <section aria-labelledby="livraison">
          <h2 id="livraison" className="display text-[34px]">
            Livraison et reprise
          </h2>
          <p className="mt-2 text-muted">Nous déposons le matériel avant l’événement et revenons le chercher ensuite. Le prix couvre les deux trajets.</p>
          <div className="panel mt-5 overflow-hidden">
            <table className="w-full text-left text-[15px]">
              <thead className="bg-nuit text-[13px] text-creme">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Distance depuis {settings.company.city}</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Prix</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-line">
                  <td className="px-4 py-3">
                    <p className="font-semibold">Retrait sur place</p>
                    <p className="text-[13px] text-muted">
                      {settings.company.address}, {settings.company.postal_code} {settings.company.city}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right font-bold">Gratuit</td>
                </tr>
                {zones.map((z) => (
                  <tr key={z.id} className="border-t border-line align-top">
                    <td className="px-4 py-3">
                      <p className="font-semibold">{z.name}</p>
                      <p className="text-[13px] text-muted">{z.description}</p>
                    </td>
                    <td className="tabular px-4 py-3 text-right font-bold whitespace-nowrap">{eur(z.price)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="space-y-6">
          {install && (
            <section className="panel p-6">
              <h2 className="display text-[28px]">{install.name}</h2>
              <p className="mt-2 text-ink/80">{install.description}</p>
              <p className="tabular mt-4 text-xl font-bold">
                {eur(install.price)} <span className="text-[15px] font-normal text-muted">{install.unit_label}</span>
              </p>
            </section>
          )}
          {tech && (
            <section className="panel p-6">
              <h2 className="display text-[28px]">{tech.name}</h2>
              <p className="mt-2 text-ink/80">{tech.description}</p>
              <p className="tabular mt-4 text-xl font-bold">
                {eur(tech.price)} <span className="text-[15px] font-normal text-muted">{tech.unit_label}</span>
              </p>
            </section>
          )}
        </div>
      </div>

      <section className="wrap mt-16" aria-labelledby="conditions">
        <h2 id="conditions" className="display text-[34px]">
          Les conditions en bref
        </h2>
        <div className="mt-5 grid gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['Paiement', `Acompte de ${b.deposit_percent} % ou totalité, au choix, payé en ligne par carte au moment de réserver. La réservation est confirmée aussitôt.`],
            ['Solde', `Si vous avez payé l’acompte : ${lowerFirst(b.balance_note)}`],
            ['Caution', `${eur(b.caution_amount)} par ${b.caution_method}${special > b.caution_amount ? ` (${eur(special)} pour certains packs et articles, indiqué sur leur fiche)` : ''}.`],
            ['Annulation', `${b.cancellation_early} ${b.cancellation_late}`],
          ].map(([t, d]) => (
            <div key={t} className="bg-white p-5">
              <p className="font-bold">{t}</p>
              <p className="mt-1 text-[15px] text-muted">{d}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[14px] text-muted">
          Le détail figure dans nos{' '}
          <Link to="/cgv" className="link">
            conditions générales de location
          </Link>
          .
        </p>
      </section>

      <section className="wrap mt-16" aria-labelledby="faq">
        <h2 id="faq" className="display text-[34px]">
          Questions fréquentes
        </h2>
        <div className="mt-5 divide-y divide-line rounded-[8px] border border-line bg-white">
          {[
            ['Faut-il des connaissances techniques ?', 'Non. Le matériel est réglé et testé avant chaque location, et nous vous montrons les branchements au retrait. Avec l’installation, tout est prêt quand vous arrivez.'],
            ['Peut-on brancher un téléphone ?', 'Oui, en Bluetooth ou avec un câble jack, sur la table de mixage ou directement sur les enceintes Alto TS410.'],
            ['Le matériel peut-il aller dehors ?', 'Oui, à condition qu’il reste à l’abri de la pluie et de l’humidité : prévoyez une tonnelle ou un barnum, et une prise électrique à proximité.'],
            ['Que se passe-t-il en cas de casse ?', 'Le matériel est sous votre responsabilité pendant la location. La caution couvre les dégâts éventuels ; elle vous est rendue au retour si tout est en ordre.'],
            ['Combien de temps à l’avance réserver ?', `Au moins ${b.min_notice_days} jours avant. Pour un mariage ou un week-end de juin, réservez plusieurs mois à l’avance.`],
            ...((b.custom_discount_percent ?? 0) > 0
              ? [['Peut-on composer son propre pack ?', `Oui, avec « Composez votre pack » : choisissez le son, les micros et la lumière article par article. Dès ${b.custom_discount_min_items ?? 3} articles différents loués à l’unité, ${Math.round(b.custom_discount_percent ?? 0)} % de remise s’appliquent automatiquement.`]]
              : []),
            ['Et pour une durée sur mesure ?', `Choisissez « Durée sur mesure » dans votre devis : nous vous envoyons le prix ${b.response_delay}, puis vous réglez en ligne l’acompte ou la totalité. Même chose pour une livraison en station ou un article loué sur demande.`],
          ].map(([q, a]) => (
            <details key={q} className="group px-5 py-4">
              <summary className="cursor-pointer list-none font-semibold marker:hidden">
                <span className="flex items-center justify-between gap-4">
                  {q}
                  <span className="text-xl text-or transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </span>
              </summary>
              <p className="mt-2 text-[15px] text-ink/80">{a}</p>
            </details>
          ))}
        </div>
      </section>
    </>
  )
}

// ------------------------------------------------------------------ Contact

export function ContactPage() {
  const { settings } = useCatalog()
  const { user } = useAuth()
  const c = settings.company
  const [form, setForm] = useState({ name: user?.full_name ?? '', email: user?.email ?? '', phone: user?.phone ?? '', subject: '', body: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.name.trim() || !/^\S+@\S+\.\S+$/.test(form.email) || form.body.trim().length < 5) {
      setError('Indiquez votre nom, une adresse e-mail valide et votre message.')
      return
    }
    setState('sending')
    try {
      await api.sendContact(form)
      setState('sent')
    } catch (err) {
      setError((err as Error).message)
      setState('idle')
    }
  }

  return (
    <>
      <PageHead kicker="Contact" title="Nous contacter">
        Une question sur le matériel, une date à vérifier, un événement particulier ? Écrivez-nous ou appelez directement.
      </PageHead>
      <div className="wrap mt-12 grid gap-10 lg:grid-cols-[1fr_1.3fr]">
        <div className="space-y-5">
          <a href={phoneHref(c.phone)} className="panel flex items-center gap-4 p-5 hover:border-bordeaux/40">
            <span className="grid size-11 place-items-center rounded-[6px] bg-nuit text-or-2">
              <Phone className="size-5" strokeWidth={1.7} />
            </span>
            <span>
              <span className="block text-[13px] text-muted">Téléphone</span>
              <span className="tabular block text-lg font-bold">{c.phone}</span>
            </span>
          </a>
          <div className="panel flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-[6px] bg-nuit text-or-2">
              <Mail className="size-5" strokeWidth={1.7} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] text-muted">E-mail</span>
              <span className="block font-bold break-all">
                <CopyText text={c.email} />
              </span>
            </span>
          </div>
          <div className="panel flex items-center gap-4 p-5">
            <span className="grid size-11 place-items-center rounded-[6px] bg-nuit text-or-2">
              <MapPin className="size-5" strokeWidth={1.7} />
            </span>
            <span>
              <span className="block text-[13px] text-muted">Retrait du matériel, sur rendez-vous</span>
              <span className="block font-bold">
                {c.address}, {c.postal_code} {c.city}
              </span>
            </span>
          </div>
        </div>

        <div className="panel p-5 md:p-7">
          {state === 'sent' ? (
            <div className="py-6 text-center">
              <p className="display text-[34px]">Message envoyé</p>
              <p className="mx-auto mt-2 max-w-sm text-muted">Merci {form.name.split(' ')[0]}, nous vous répondons {settings.booking.response_delay}.</p>
              <Link to="/" className="btn btn-outline mt-6">
                Retour à l’accueil
              </Link>
            </div>
          ) : (
            <form onSubmit={submit} className="grid gap-4" noValidate>
              <h2 className="text-xl font-bold">Envoyer un message</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nom" htmlFor="c-name">
                  <input id="c-name" className="input" autoComplete="name" value={form.name} onChange={set('name')} required />
                </Field>
                <Field label="Téléphone" htmlFor="c-phone" optional>
                  <input id="c-phone" className="input" type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} />
                </Field>
              </div>
              <Field label="E-mail" htmlFor="c-email">
                <input id="c-email" className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required />
              </Field>
              <Field label="Sujet" htmlFor="c-subject" optional>
                <input id="c-subject" className="input" value={form.subject} onChange={set('subject')} placeholder="Mariage le 13 juin, fête de village…" />
              </Field>
              <Field label="Message" htmlFor="c-body">
                <textarea id="c-body" className="input min-h-36" value={form.body} onChange={set('body')} required />
              </Field>
              {error && <Notice tone="bad">{error}</Notice>}
              <div>
                <button type="submit" className="btn btn-primary" disabled={state === 'sending'}>
                  {state === 'sending' && <Spinner className="size-4" />} Envoyer le message
                </button>
              </div>
              <p className="text-[13px] text-muted">
                Vos coordonnées servent uniquement à vous répondre. Voir notre{' '}
                <Link to="/confidentialite" className="link font-normal">
                  politique de confidentialité
                </Link>
                .
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ Pages légales

function LegalShell({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <>
      <PageHead kicker="Informations légales" title={title} />
      <article className="wrap mt-10 max-w-3xl space-y-4 text-[16px] leading-relaxed text-ink/85 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-1.5">
        {children}
        {updated && <p className="pt-6 text-[14px] text-muted">Dernière mise à jour : {updated}</p>}
      </article>
    </>
  )
}

export function CgvPage() {
  const { settings } = useCatalog()
  const c = settings.company
  const b = settings.booking
  return (
    <LegalShell title="Conditions de location" updated="novembre 2026">
      <p>
        Les présentes conditions s’appliquent à toute location de matériel de sonorisation et d’éclairage proposée par {c.name}, {c.owner}, {c.address},{' '}
        {c.postal_code} {c.city} (SIRET {c.siret}), ci-après « le loueur ».
      </p>
      <h2>1. Réservation et devis</h2>
      <p>
        Le client compose sa réservation sur le site en indiquant les dates, le matériel et les prestations souhaitées. Les disponibilités affichées tiennent compte
        des réservations en cours et des indisponibilités du loueur. Les prix affichés sont nets ({c.vat_note}). Pour une durée sur mesure, une livraison sur devis
        ou un article loué sur demande, le loueur établit un devis, valable {b.quote_validity_days} jours. Les photos du site sont non contractuelles : seul le
        matériel indiqué sur la réservation fait foi.
      </p>
      <h2>2. Paiement et confirmation</h2>
      <p>
        La réservation est confirmée dès le paiement, au choix du client, d’un acompte de {b.deposit_percent} % du montant total ou de la totalité, réglé en
        ligne par carte bancaire sur une page de paiement sécurisée. Le matériel est réservé au client pendant le paiement ; tant que rien n’est réglé, la date
        n’est pas garantie. Si le client a payé l’acompte : {lowerFirst(b.balance_note)}
      </p>
      <p>
        Un paiement qui arrive alors que la réservation ne peut plus être confirmée (réservation annulée ou déjà réglée, ou délai de paiement dépassé et matériel
        réservé entre-temps par un autre client) est remboursé intégralement, et le client en est informé par e-mail.
      </p>
      <h2>3. Caution</h2>
      <p>
        Une caution de {eur(b.caution_amount)} est demandée à la remise du matériel ({b.caution_method}). Certains articles et packs, signalés sur leur fiche, font
        l’objet d’une caution plus élevée : c’est alors elle qui s’applique. La caution est rendue au retour du matériel, après vérification de son état.
      </p>
      <h2>4. Durée de location</h2>
      <ul>
        <li>Forfait 24 h : {b.day_label.toLowerCase()}.</li>
        <li>Forfait week-end : {b.weekend_label.toLowerCase()}.</li>
        <li>Toute autre durée fait l’objet d’un devis.</li>
      </ul>
      <p>Les horaires précis de retrait, de livraison et de retour sont convenus avec le client. Un retard de restitution non prévenu peut être facturé.</p>
      <h2>5. Responsabilité du client</h2>
      <p>
        Le client est responsable du matériel pendant toute la durée de mise à disposition (vol, casse, détérioration). Il l’utilise dans des conditions normales,
        à l’abri de la pluie et de l’humidité, sur une installation électrique conforme. Il s’assure que le lieu autorise l’usage de la machine à fumée et des
        effets lumineux. Toute dégradation est facturée au prix de la réparation ou du remplacement, déduction faite de la caution.
      </p>
      <h2>6. Livraison, installation et présence technique</h2>
      <p>
        Les frais de livraison et de reprise dépendent de la distance et sont indiqués sur le devis. Le client garantit un accès praticable et une alimentation
        électrique à proximité. L’installation comprend la mise en place, le réglage et le démontage du matériel loué.
      </p>
      <h2>7. Annulation</h2>
      <ul>
        <li>{b.cancellation_early}</li>
        <li>{b.cancellation_late}</li>
      </ul>
      <p>Une réservation qui n’est pas encore payée peut être annulée sans frais depuis l’espace client.</p>
      <h2>8. Réclamations et médiation</h2>
      <p>
        Pour toute réclamation, contactez-nous par e-mail ({c.email}) ou par téléphone ({c.phone}) : une solution amiable sera toujours recherchée en premier.
        {c.mediator_name?.trim() ? (
          <>
            {' '}
            À défaut d’accord, vous pouvez recourir gratuitement au médiateur de la consommation : {c.mediator_name}
            {c.mediator_url?.trim() ? ` (${c.mediator_url.trim()})` : ''}.
          </>
        ) : null}
      </p>
      <h2>9. Droit applicable</h2>
      <p>Les présentes conditions sont soumises au droit français.</p>
    </LegalShell>
  )
}

export function MentionsPage() {
  const { settings } = useCatalog()
  const c = settings.company
  return (
    <LegalShell title="Mentions légales">
      <h2>Éditeur du site</h2>
      <p>
        {c.name}, {c.owner}, {c.status}
        <br />
        {c.address}, {c.postal_code} {c.city}
        <br />
        SIRET : {c.siret}
        <br />
        Téléphone : {c.phone} · E-mail : {c.email}
        <br />
        {c.vat_note}
      </p>
      <p>Directeur de la publication : {c.owner}.</p>
      <h2>Hébergement</h2>
      <p>
        Site hébergé par Cloudflare, Inc., 101 Townsend Street, San Francisco, CA 94107, États-Unis, téléphone : +1 888 993 5273, cloudflare.com.
      </p>
      <p>
        Comptes clients et réservations hébergés par Supabase Pte. Ltd., 65 Chulia Street #38-02/03, OCBC Centre, Singapour 049513, legal@supabase.io,
        supabase.com, sur des serveurs situés dans l’Union européenne.
      </p>
      <h2>Propriété intellectuelle</h2>
      <p>
        Les textes, le logo et les photos d’installations du site appartiennent à {c.name} : toute reproduction sans autorisation est interdite. Les marques citées
        et les visuels de produits fournis par les fabricants restent la propriété de leurs détenteurs respectifs.
      </p>
    </LegalShell>
  )
}

export function PrivacyPage() {
  const { settings } = useCatalog()
  const c = settings.company
  return (
    <LegalShell title="Confidentialité" updated="novembre 2026">
      <p>{c.name} attache de l’importance à la protection de vos données personnelles. Cette page explique quelles données sont collectées, pourquoi, et comment exercer vos droits.</p>
      <h2>Responsable du traitement</h2>
      <p>
        {c.owner}, {c.name} ({c.status}), {c.address}, {c.postal_code} {c.city}. Contact : {c.email}.
      </p>
      <h2>Données collectées</h2>
      <ul>
        <li>À la création de votre compte : nom, adresse e-mail, téléphone, mot de passe (enregistré chiffré).</li>
        <li>Pour chaque réservation : dates, matériel, adresse de livraison, informations sur l’événement et votre message.</li>
        <li>Par le formulaire de contact : nom, e-mail, téléphone facultatif et message.</li>
      </ul>
      <h2>Utilisation et bases légales</h2>
      <ul>
        <li>Gérer votre compte, vos réservations, la livraison et le paiement : exécution du contrat de location.</li>
        <li>Établir et conserver les factures : obligation légale.</li>
        <li>Répondre à vos messages et demandes de devis : mesures précontractuelles prises à votre demande.</li>
        <li>Sécuriser le site et prévenir les abus : intérêt légitime.</li>
      </ul>
      <p>Vos données ne sont ni vendues ni cédées, et ne servent à aucune publicité.</p>
      <h2>Paiement</h2>
      <p>
        Le paiement se fait sur la page de paiement sécurisée de Stripe. Vos données bancaires sont saisies chez Stripe et ne transitent jamais par notre site.
      </p>
      <h2>Destinataires et prestataires</h2>
      <p>
        Vos données sont traitées par {c.owner} et par nos prestataires techniques : Supabase (base de données et comptes, serveurs dans l’Union européenne), Stripe
        (paiement), Resend (envoi des e-mails) et Cloudflare (hébergement du site). Certains sont établis hors de l’Union européenne : ces transferts sont encadrés
        par des garanties prévues par le RGPD (clauses contractuelles types de la Commission européenne ou cadre de protection des données UE–États-Unis).
      </p>
      <h2>Durée de conservation</h2>
      <ul>
        <li>Compte client : jusqu’à sa suppression, que vous pouvez demander à tout moment.</li>
        <li>Réservations et factures : dix ans, durée imposée pour les pièces comptables.</li>
        <li>Messages du formulaire de contact : le temps de vous répondre, puis trois ans au plus.</li>
      </ul>
      <h2>Cookies</h2>
      <p>
        Le site n’utilise ni publicité ni outil de mesure d’audience. Il enregistre seulement dans votre navigateur votre session de connexion et votre devis en
        cours, indispensables à son fonctionnement : aucun consentement n’est donc demandé.
      </p>
      <h2>Vos droits</h2>
      <p>
        Vous pouvez demander l’accès à vos données, leur rectification, leur effacement, leur portabilité, la limitation de leur traitement ou vous y opposer, en
        écrivant à {c.email}. Nous vous répondons dans un délai d’un mois. Si vous estimez que vos droits ne sont pas respectés, vous pouvez adresser une
        réclamation à la CNIL (cnil.fr).
      </p>
    </LegalShell>
  )
}
