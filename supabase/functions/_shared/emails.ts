// Modèles d'e-mails et envoi par Resend.
import { SITE_URL, reviewUrl, type BookingRow, type Settings } from './common.ts'

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')

const eur = (n: number | null | undefined) =>
  n === null || n === undefined
    ? 'à définir'
    : new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: Number.isInteger(Number(n)) ? 0 : 2 }).format(Number(n))

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']
const DAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
const day = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d))
  return `${DAYS[date.getUTCDay()]} ${d === 1 ? '1er' : d} ${MONTHS[m - 1]} ${y}`
}
export const range = (a: string, b: string) => `du ${day(a)} au ${day(b)}`

function layout(settings: Settings, title: string, body: string): string {
  const c = settings.company
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f5eae0;font-family:Arial,Helvetica,sans-serif;color:#23141a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5eae0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#2a0e1a;padding:22px 28px;border-bottom:3px solid #b98a34">
<div style="font-size:20px;font-weight:bold;letter-spacing:1px;color:#f5eae0;text-transform:uppercase">${esc(c.name)}</div>
<div style="font-size:12px;color:#d4aa5a;margin-top:4px">Sonorisation · Éclairage</div></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">${body}</td></tr>
<tr><td style="padding:18px 28px;background:#fbf7f3;font-size:12px;color:#6c5a61;line-height:1.5">
${esc(c.name)} · ${esc(c.owner)} · ${esc(c.address)}, ${esc(c.postal_code)} ${esc(c.city)}<br>
${esc(c.phone)} · ${esc(c.email)} · ${esc(c.vat_note)}${c.mediator_name ? `<br>Médiateur de la consommation : ${esc(c.mediator_name)}${c.mediator_url ? ` (${esc(c.mediator_url)})` : ''}` : ''}</td></tr>
</table></td></tr></table></body></html>`
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="display:inline-block;background:#7a2540;color:#ffffff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:5px">${esc(label)}</a></p>`

function recap(b: BookingRow, settings: Settings): string {
  const paidAll = b.total !== null && Number(b.deposit_paid_amount ?? 0) >= Number(b.total)
  const rows = b.booking_items
    .map(
      (i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #e8ddd4">${i.quantity > 1 ? `${i.quantity} × ` : ''}${esc(i.name)}</td>
<td style="padding:8px 0;border-bottom:1px solid #e8ddd4;text-align:right;white-space:nowrap">${i.unit_price === null ? 'à définir' : eur(Number(i.unit_price) * i.quantity)}</td></tr>`,
    )
    .join('')
  return `<p style="margin:0 0 6px;font-weight:bold">Réservation ${esc(b.reference)}, ${esc(range(b.start_date, b.end_date))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}
<tr><td style="padding:10px 0 2px;font-weight:bold">Total</td><td style="padding:10px 0 2px;text-align:right;font-weight:bold">${eur(b.total)}</td></tr>
${
    paidAll
      ? `<tr><td style="color:#6c5a61">Réglé</td><td style="text-align:right;color:#6c5a61">${eur(b.deposit_paid_amount)}</td></tr>`
      : b.deposit_amount !== null
        ? `<tr><td style="color:#6c5a61">Acompte (${settings.booking.deposit_percent} %)</td><td style="text-align:right;color:#6c5a61">${eur(b.deposit_amount)}</td></tr>`
        : ''
  }
</table>`
}

const firstName = (b: BookingRow) => esc(b.client_name.split(' ')[0] || '')

/** Pourquoi un paiement n'a pas pu confirmer la réservation (raisons données par confirm_payment). */
const REFUND_REASONS: Record<string, string> = {
  deja_payee: 'l’acompte de cette réservation avait déjà été réglé',
  annulee: 'cette réservation avait été annulée',
  indisponible: 'le délai de paiement était dépassé et le matériel a été réservé entre-temps',
  date_passee: 'la date de début de la location était passée',
}
const clientLink = (b: BookingRow) => `${SITE_URL}/espace-client/reservations/${b.id}`
const adminLink = (b: BookingRow) => `${SITE_URL}/admin/reservations/${b.id}`

export interface Mail {
  to: string
  subject: string
  html: string
  replyTo?: string
}

export const mails = {
  createdClient: (b: BookingRow, s: Settings): Mail => ({
    to: b.client_email,
    replyTo: s.company.email,
    subject: `Demande ${b.reference} bien reçue`,
    html: layout(
      s,
      'Demande reçue',
      `<p>Bonjour ${firstName(b)},</p>
<p>Merci pour votre demande. Nous vérifions la disponibilité du matériel et le prix, puis nous vous répondons ${esc(s.booking.response_delay)}.</p>
${recap(b, s)}
<p style="margin-top:18px">Vous ne payez rien pour l’instant : vous réglerez en ligne l’acompte ou la totalité, une fois le devis validé.</p>
${button(clientLink(b), 'Suivre ma demande')}`,
    ),
  }),

  createdAdmin: (b: BookingRow, s: Settings, to: string): Mail => ({
    to,
    replyTo: b.client_email,
    subject: `Nouvelle demande ${b.reference} : ${b.client_name}, ${day(b.start_date)}`,
    html: layout(
      s,
      'Nouvelle demande',
      `<p><strong>${esc(b.client_name)}</strong><br>${esc(b.client_email)} · ${esc(b.client_phone)}</p>
<p>${esc([b.event_type, b.guests ? `${b.guests} invités` : '', b.venue].filter(Boolean).join(', '))}${b.address ? `<br>Livraison : ${esc(b.address)}` : ''}</p>
${b.message ? `<p style="background:#f5eae0;padding:12px;border-radius:6px">${esc(b.message)}</p>` : ''}
${recap(b, s)}
${button(adminLink(b), 'Traiter la demande')}`,
    ),
  }),

  validated: (b: BookingRow, s: Settings): Mail => ({
    to: b.client_email,
    replyTo: s.company.email,
    subject: `Votre devis ${b.reference} est prêt`,
    html: layout(
      s,
      'Devis validé',
      `<p>Bonjour ${firstName(b)},</p>
<p>Bonne nouvelle : votre devis est validé.</p>
${b.client_note ? `<p style="background:#f5eae0;padding:12px;border-radius:6px">${esc(b.client_note)}</p>` : ''}
${recap(b, s)}
<p style="margin-top:18px">Pour confirmer la réservation, réglez par carte l’acompte de <strong>${eur(b.deposit_amount)}</strong> (le solde le jour de la location) ou la totalité, <strong>${eur(b.total)}</strong>${b.valid_until ? `, avant le ${esc(day(b.valid_until))}` : ''}. La date sera alors réservée pour vous.</p>
${button(clientLink(b), 'Régler ma réservation')}`,
    ),
  }),

  refused: (b: BookingRow, s: Settings): Mail => ({
    to: b.client_email,
    replyTo: s.company.email,
    subject: `Votre demande ${b.reference}`,
    html: layout(
      s,
      'Demande non retenue',
      `<p>Bonjour ${firstName(b)},</p>
<p>${b.client_note ? esc(b.client_note) : `Nous ne pouvons malheureusement pas assurer votre demande ${esc(range(b.start_date, b.end_date))}.`}</p>
<p>N’hésitez pas à nous appeler au ${esc(s.company.phone)} pour trouver une autre solution.</p>`,
    ),
  }),

  paidClient: (b: BookingRow, s: Settings): Mail => {
    const balance = b.total !== null ? Math.max(Number(b.total) - Number(b.deposit_paid_amount ?? 0), 0) : null
    const caution = b.caution_amount ?? s.booking.caution_amount
    return {
      to: b.client_email,
      replyTo: s.company.email,
      subject: `Réservation ${b.reference} confirmée`,
      html: layout(
        s,
        'Réservation confirmée',
        `<p>Bonjour ${firstName(b)},</p>
<p>Nous avons bien reçu votre ${balance ? 'acompte' : 'paiement'} de <strong>${eur(b.deposit_paid_amount)}</strong> : votre réservation est confirmée${balance ? '' : ' et entièrement réglée'}.</p>
${recap(b, s)}
<p style="margin-top:18px">${balance ? `Solde restant : <strong>${eur(balance)}</strong>. ${esc(s.booking.balance_note)}<br>` : ''}Caution : ${eur(caution)} par ${esc(s.booking.caution_method)}.</p>
<p>Nous vous contacterons quelques jours avant pour caler les horaires.</p>
${button(clientLink(b), 'Voir ma réservation')}`,
      ),
    }
  },

  paidAdmin: (b: BookingRow, s: Settings, to: string): Mail => ({
    to,
    replyTo: b.client_email,
    subject: `Nouvelle réservation ${b.reference} : ${b.client_name}, ${day(b.start_date)}`,
    html: layout(
      s,
      'Réservation confirmée',
      `<p><strong>${esc(b.client_name)}</strong> a réglé ${
        b.total !== null && Number(b.deposit_paid_amount ?? 0) >= Number(b.total) ? 'la totalité' : 'l’acompte'
      }, <strong>${eur(b.deposit_paid_amount)}</strong> : la réservation est confirmée.</p>
<p>${esc(b.client_email)} · ${esc(b.client_phone)}</p>
<p>${esc([b.event_type, b.guests ? `${b.guests} invités` : '', b.venue].filter(Boolean).join(', '))}${b.address ? `<br>Livraison : ${esc(b.address)}` : ''}</p>
${b.message ? `<p style="background:#f5eae0;padding:12px;border-radius:6px">${esc(b.message)}</p>` : ''}
${recap(b, s)}
${button(adminLink(b), 'Voir la réservation')}`,
    ),
  }),

  refundClient: (b: BookingRow, s: Settings, amount: number, reason: string, refunded: boolean): Mail => ({
    to: b.client_email,
    replyTo: s.company.email,
    subject: `Votre paiement pour la réservation ${b.reference}`,
    html: layout(
      s,
      'Paiement remboursé',
      `<p>Bonjour ${firstName(b)},</p>
<p>Nous avons bien reçu votre paiement de <strong>${eur(amount)}</strong>, mais il n’a pas pu confirmer la réservation ${esc(b.reference)} (${esc(range(b.start_date, b.end_date))}) : ${esc(REFUND_REASONS[reason] ?? REFUND_REASONS.annulee)}.</p>
<p>${refunded ? 'Il vous a été <strong>remboursé intégralement</strong> : le montant réapparaît sur votre compte sous 5 à 10 jours.' : 'Il vous sera <strong>remboursé intégralement</strong> dans les prochains jours.'}</p>
<p>Pour trouver une autre solution, appelez-nous au ${esc(s.company.phone)} ou répondez à cet e-mail.</p>`,
    ),
  }),

  refundAdmin: (b: BookingRow, s: Settings, to: string, amount: number, reason: string, refunded: boolean): Mail => ({
    to,
    replyTo: b.client_email,
    subject: refunded ? `Paiement remboursé automatiquement : ${b.reference}` : `À rembourser : paiement reçu pour ${b.reference}`,
    html: layout(
      s,
      refunded ? 'Paiement remboursé' : 'Paiement à rembourser',
      `<p><strong>${esc(b.client_name)}</strong> a payé <strong>${eur(amount)}</strong> pour la réservation ${esc(b.reference)} (${esc(range(b.start_date, b.end_date))}), mais ce paiement ne pouvait pas la confirmer : ${esc(REFUND_REASONS[reason] ?? REFUND_REASONS.annulee)}.</p>
<p>${
        refunded
          ? 'Il a été remboursé automatiquement par Stripe, et le client en est informé par e-mail.'
          : '<strong>Le remboursement automatique n’a pas fonctionné.</strong> Remboursez ce paiement depuis votre tableau de bord Stripe (Paiements), puis cliquez sur « Marquer comme remboursé » dans la réservation.'
      }</p>
<p>${esc(b.client_email)} · ${esc(b.client_phone)}</p>
${button(adminLink(b), 'Voir la réservation')}`,
    ),
  }),

  /** Après la location (réservation passée en « terminée ») : merci, et le lien pour laisser un avis Google. */
  finished: (b: BookingRow, s: Settings): Mail => ({
    to: b.client_email,
    replyTo: s.company.email,
    subject: `Merci pour votre confiance`,
    html: layout(
      s,
      'Merci',
      `<p>Bonjour ${firstName(b)},</p>
<p>Merci d’avoir loué votre matériel chez ${esc(s.company.name)} ${esc(range(b.start_date, b.end_date))}. Nous espérons que votre événement s’est bien passé.</p>
<p>Si vous avez été satisfait, un avis sur Google nous aide beaucoup à nous faire connaître : cela ne prend qu’une minute.</p>
${button(reviewUrl(s) ?? SITE_URL, 'Laisser un avis sur Google')}
<p>Une remarque, une idée pour la prochaine fois ? Répondez simplement à cet e-mail.</p>`,
    ),
  }),

  cancelledAdmin: (b: BookingRow, s: Settings, to: string): Mail => ({
    to,
    subject: `Demande ${b.reference} annulée par le client`,
    html: layout(s, 'Demande annulée', `<p>${esc(b.client_name)} a annulé sa demande ${esc(range(b.start_date, b.end_date))}.</p>${button(adminLink(b), 'Voir la demande')}`),
  }),

  contactAdmin: (m: { name: string; email: string; phone: string; subject: string; body: string }, s: Settings, to: string): Mail => ({
    to,
    replyTo: m.email,
    subject: `Nouveau message : ${m.subject || m.name}`,
    html: layout(
      s,
      'Nouveau message',
      `<p><strong>${esc(m.name)}</strong><br>${esc(m.email)}${m.phone ? ` · ${esc(m.phone)}` : ''}</p>
<p style="background:#f5eae0;padding:12px;border-radius:6px;white-space:pre-line">${esc(m.body)}</p>
<p style="color:#6c5a61;font-size:13px">Répondez directement à cet e-mail pour écrire à ${esc(m.name)}.</p>`,
    ),
  }),
}

export async function send(mail: Mail): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key || !mail.to) {
    console.warn('E-mail non envoyé (RESEND_API_KEY ou destinataire manquant) :', mail.subject)
    return false
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Alpes & Sound Location <reservations@alpes-sound-location.fr>',
      to: [mail.to],
      subject: mail.subject,
      html: mail.html,
      ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
    }),
  })
  if (!res.ok) console.error('Resend', res.status, await res.text())
  return res.ok
}

export function adminEmail(s: Settings): string {
  return Deno.env.get('ADMIN_EMAIL') ?? s.company.email
}
