// Page admin « Devis & Contrats » — génère des devis/contrats PDF à partir du
// catalogue du site (products + packs), avec signatures, historique local,
// infos de paiement de l'acompte. Accessible seulement à l'administrateur
// (sous AdminLayout). L'historique est stocké en localStorage sur l'appareil.
import { useEffect, useMemo, useRef, useState } from 'react'
import { AdminTitle } from '../../components/layout'
import { useCatalog } from '../../lib/store'
import { LOGO_LOCKUP } from '../../lib/devis-logo'

// ---------------------------------------------------------------- Constantes
const ENTREPRISE = {
  nom: 'Alpes & Sound Location',
  contact: 'Rémi Aguettaz',
  adresse: '543 Route du Marais, 73800 La Chavanne',
  tel: '07 67 70 64 53',
  email: 'remiapro@gmail.com',
  siret: '99284328400017',
  statut: 'Micro-entreprise',
}
const PAIEMENT = {
  weroTel: '07 67 70 64 53',
  titulaire: 'M. Rémi Aguettaz',
  iban: 'FR76 1027 8088 9200 0237 4310 188',
  bic: 'CMCIFR2A',
}
const MODES: Record<string, string> = {
  main_propre: 'Remise en main propre',
  livraison: 'Livraison',
  livraison_install: 'Livraison + installation / démontage',
}
const labelMode = (m: string) => MODES[m] || MODES.main_propre

// ---------------------------------------------------------------- Types
interface Ligne { nom: string; desc: string; qte: number; pu: number; montant: number }
interface Client { nom: string; prenom: string; tel: string; email: string; adresse: string }
interface Evt { debut: string; fin: string; tarif: '24h' | 'we'; lieu: string; mode: string }
interface Doc {
  id: number; type: 'devis' | 'contrat'; validite: number | null
  numero: string; dateEdit: string; dateISO: string
  client: Client; evt: Evt; lignes: Ligne[]
  install: number; remise: number; total: number
  caution: number; acomptePct: number; sigClient: string | null
}
interface CatItem { nom: string; desc: string; p24: number; pwe: number; caution: number }

// ---------------------------------------------------------------- Helpers
const fmt = (n: number) => Number(n || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const frDate = (s?: string) => (s ? new Date(s).toLocaleDateString('fr-FR') : null)
function formatPeriode(d?: string, f?: string) {
  if (d && f && d !== f) return `du ${frDate(d)} au ${frDate(f)}`
  if (d) return `le ${frDate(d)}`
  return '—'
}
const num = (v: unknown) => { const n = parseFloat(String(v)); return isNaN(n) ? 0 : n }

const store = {
  get<T>(k: string, def: T): T { try { const v = localStorage.getItem('asl_devis_' + k); return v ? (JSON.parse(v) as T) : def } catch { return def } },
  set(k: string, v: unknown) { try { localStorage.setItem('asl_devis_' + k, JSON.stringify(v)) } catch { /* ignore */ } },
}

// ---------------------------------------------------------------- Moteur PDF (JPEG plein page -> PDF, sans librairie)
function jpegVersPDF(jpegBytes: Uint8Array, wPx: number, hPx: number): Uint8Array {
  const PW = 595.28, PH = 841.89
  const ratio = wPx / hPx
  const dw = PW, dh = PW / ratio
  const oy = PH - dh, ox = 0
  const enc = (s: string) => { const a: number[] = []; for (let i = 0; i < s.length; i++) a.push(s.charCodeAt(i) & 0xff); return a }
  const out: number[] = []; const push = (a: number[]) => { for (const b of a) out.push(b) }
  const offsets: Record<number, number> = {}
  const content = `q ${dw.toFixed(2)} 0 0 ${dh.toFixed(2)} ${ox.toFixed(2)} ${oy.toFixed(2)} cm /Im0 Do Q`
  push(enc('%PDF-1.4\n%\xFF\xFF\xFF\xFF\n'))
  const wO = (n: number, head: string, stream?: number[]) => {
    offsets[n] = out.length; push(enc(`${n} 0 obj\n`)); push(enc(head))
    if (stream) { push(enc('\nstream\n')); push(stream); push(enc('\nendstream')) }
    push(enc('\nendobj\n'))
  }
  wO(1, '<< /Type /Catalog /Pages 2 0 R >>')
  wO(2, '<< /Type /Pages /Kids [3 0 R] /Count 1 >>')
  wO(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`)
  wO(4, `<< /Length ${content.length} >>`, enc(content))
  wO(5, `<< /Type /XObject /Subtype /Image /Width ${wPx} /Height ${hPx} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>`, Array.from(jpegBytes))
  const xref = out.length
  push(enc('xref\n0 6\n0000000000 65535 f \n'))
  for (let i = 1; i <= 5; i++) push(enc(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`))
  push(enc(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`))
  return new Uint8Array(out)
}
const chargerImage = (src: string | null): Promise<HTMLImageElement | null> =>
  new Promise((res) => { if (!src) return res(null); const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src })

// ---------------------------------------------------------------- Dessin du document sur canvas
async function dessinerContrat(c: Doc, sigLoueur: string | null): Promise<HTMLCanvasElement> {
  const estDevis = c.type === 'devis'
  const dateValidite = estDevis && c.dateISO ? new Date(new Date(c.dateISO).getTime() + (c.validite || 30) * 86400000).toLocaleDateString('fr-FR') : null
  const SC = 2, W = 794, M = 56, cw = W - M * 2
  const cv = document.createElement('canvas'); const ctx = cv.getContext('2d')!
  const H = 1123; cv.width = W * SC; cv.height = H * SC; ctx.scale(SC, SC)
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.textBaseline = 'top'
  let y = M
  const BORD = '#7A2540'
  const line = (txt: string, o: { size?: number; bold?: boolean; color?: string; gap?: number; x?: number } = {}) => {
    const { size = 13, bold = false, color = '#2a2a2a', gap = 6, x = M } = o
    ctx.fillStyle = color; ctx.font = `${bold ? 'bold ' : ''}${size}px Helvetica, Arial, sans-serif`; ctx.fillText(txt, x, y); y += size + gap
  }
  const wrap = (txt: string, o: { size?: number; color?: string; x?: number; maxw?: number } = {}) => {
    const { size = 11, color = '#333', x = M, maxw = cw } = o
    ctx.fillStyle = color; ctx.font = `${size}px Helvetica, Arial, sans-serif`
    const words = String(txt).split(' '); let cur = ''
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxw && cur) { ctx.fillText(cur, x, y); y += size + 3; cur = w } else cur = t }
    if (cur) { ctx.fillText(cur, x, y); y += size + 3 }
  }
  const rule = (color = '#B98A34', h = 2) => { ctx.fillStyle = color; ctx.fillRect(M, y, cw, h); y += h + 8 }

  const logo = await chargerImage(LOGO_LOCKUP)
  if (logo) { const lw = 190, lh = logo.height * lw / logo.width; ctx.drawImage(logo, M, y, lw, lh); y += lh + 6 }
  else line('Alpes & Sound Location', { size: 22, bold: true, color: BORD, gap: 4 })
  line(`${ENTREPRISE.contact} · ${ENTREPRISE.statut}`, { size: 10, color: '#444', gap: 2 })
  line(ENTREPRISE.adresse, { size: 10, color: '#444', gap: 2 })
  line(`${ENTREPRISE.tel} · ${ENTREPRISE.email}`, { size: 10, color: '#444', gap: 2 })
  line(`SIRET ${ENTREPRISE.siret}`, { size: 10, color: '#444', gap: 8 })
  line(`${estDevis ? 'DEVIS' : 'CONTRAT DE LOCATION'}  —  N° ${c.numero}`, { size: 13, bold: true, color: BORD, gap: 2 })
  line(`Édité le ${c.dateEdit}`, { size: 10, color: '#555', gap: dateValidite ? 2 : 10 })
  if (dateValidite) line(`Devis valable jusqu'au ${dateValidite}`, { size: 10, color: BORD, gap: 10 })
  rule()

  const yC = y
  line('CLIENT', { size: 10, bold: true, color: BORD, gap: 4 })
  line(`${c.client.prenom} ${c.client.nom}`.trim() || '—', { size: 12, bold: true, gap: 3 })
  if (c.client.adresse) line(c.client.adresse, { size: 11, color: '#333', gap: 3 })
  if (c.client.tel) line(`Tél : ${c.client.tel}`, { size: 11, color: '#333', gap: 3 })
  if (c.client.email) line(c.client.email, { size: 11, color: '#333', gap: 3 })
  const yAC = y; y = yC; const xR = M + cw / 2
  line('PRESTATION', { size: 10, bold: true, color: BORD, gap: 4, x: xR })
  line(`Période : ${formatPeriode(c.evt.debut, c.evt.fin)}`, { size: 11, color: '#222', gap: 3, x: xR })
  line(`Tarif : ${c.evt.tarif === 'we' ? 'Week-end' : '24h'}`, { size: 11, color: '#222', gap: 3, x: xR })
  line(`Remise : ${labelMode(c.evt.mode)}`, { size: 11, color: '#222', gap: 3, x: xR })
  if (c.evt.lieu) line(`Lieu : ${c.evt.lieu}`, { size: 11, color: '#222', gap: 3, x: xR })
  y = Math.max(yAC, y) + 8; rule('#e0d8d5', 1)

  line('MATÉRIEL LOUÉ', { size: 11, bold: true, color: BORD, gap: 6 })
  const colQ = M + cw - 230, colPU = M + cw - 150, colMt = M + cw - 60
  ctx.font = 'bold 10px Helvetica, Arial'; ctx.fillStyle = '#777'
  ctx.fillText('Désignation', M, y); ctx.fillText('Qté', colQ, y); ctx.fillText('P.U.', colPU, y); ctx.fillText('Montant', colMt, y)
  y += 16; ctx.fillStyle = '#e0d8d5'; ctx.fillRect(M, y - 4, cw, 1)
  const ligne = (nom: string, qte: number | string, pu: string, mt: string, desc?: string) => {
    ctx.fillStyle = '#2a2a2a'; ctx.font = '12px Helvetica, Arial'
    ctx.fillText(nom, M, y); ctx.fillText(String(qte), colQ, y); ctx.fillText(pu, colPU, y); ctx.fillText(mt, colMt, y); y += 16
    if (desc) wrap(desc, { size: 9.5, color: '#777', maxw: cw - 240 }); y += 4
  }
  c.lignes.forEach((l) => ligne(l.nom, l.qte, `${fmt(l.pu)} €`, `${fmt(l.montant)} €`, l.desc))
  if (c.install > 0) ligne('Livraison / installation', 1, `${fmt(c.install)} €`, `${fmt(c.install)} €`)
  if (c.remise > 0) ligne('Remise commerciale', '', '', `− ${fmt(c.remise)} €`)
  ctx.fillStyle = BORD; ctx.fillRect(M, y, cw, 2); y += 8
  line(`TOTAL À RÉGLER : ${fmt(c.total)} €`, { size: 14, bold: true, x: M + cw - 230, gap: 12 })

  const acompte = c.total * c.acomptePct / 100; const yP = y
  line('RÈGLEMENT', { size: 10, bold: true, color: BORD, gap: 4 })
  line(`Acompte (${c.acomptePct}%) : ${fmt(acompte)} €`, { size: 11, color: '#222', gap: 3 })
  line(`Solde : ${fmt(c.total - acompte)} € (jour de l'installation)`, { size: 11, color: '#222', gap: 3 })
  const yA = y; y = yP
  line('CAUTION', { size: 10, bold: true, color: BORD, gap: 4, x: xR })
  line(`${fmt(c.caution)} € par chèque non encaissé`, { size: 11, color: '#222', gap: 3, x: xR })
  line('Restituée au démontage du matériel.', { size: 11, color: '#222', gap: 3, x: xR })
  y = Math.max(yA, y) + 8; rule('#e0d8d5', 1)

  line("RÈGLEMENT DE L'ACOMPTE", { size: 10, bold: true, color: BORD, gap: 4 })
  line(`Wero : au ${PAIEMENT.weroTel} (${PAIEMENT.titulaire})`, { size: 11, color: '#222', gap: 3 })
  line(`Virement : ${PAIEMENT.titulaire}`, { size: 11, color: '#222', gap: 3 })
  line(`IBAN ${PAIEMENT.iban}  —  BIC ${PAIEMENT.bic}`, { size: 11, color: '#222', gap: 3 })
  y += 5; rule('#e0d8d5', 1)

  line('CONDITIONS GÉNÉRALES', { size: 10, bold: true, color: BORD, gap: 5 })
  ;[`• La réservation est effective après signature du présent document et versement de l'acompte de ${c.acomptePct}% du montant total.`,
    '• Le solde est à régler au plus tard le jour de l\'installation.',
    `• Une caution de ${fmt(c.caution)} € est demandée lors de l'installation (chèque non encaissé), restituée au démontage.`,
    '• Le client est responsable du matériel pendant toute la durée de mise à disposition (vol, casse, détérioration).'].forEach((t) => wrap(t, { size: 10, color: '#333' }))
  y += 4
  line("CONDITIONS D'ANNULATION", { size: 10, bold: true, color: BORD, gap: 5 })
  ;['• Annulation plus de 7 jours avant l\'événement : acompte conservé.',
    '• Annulation moins de 7 jours avant l\'événement : totalité de la prestation due.'].forEach((t) => wrap(t, { size: 10, color: '#333' }))
  y += 14

  const [imgL, imgC] = await Promise.all([chargerImage(sigLoueur), chargerImage(c.sigClient)])
  const boxW = (cw - 30) / 2, boxH = 90
  const drawBox = (x: number, titre: string, note: string, img: HTMLImageElement | null) => {
    ctx.strokeStyle = '#e0d8d5'; ctx.lineWidth = 1; ctx.strokeRect(x, y, boxW, boxH)
    ctx.fillStyle = '#777'; ctx.font = '9px Helvetica, Arial'; ctx.fillText(titre, x + 8, y + 8)
    if (note) { ctx.fillStyle = '#999'; ctx.fillText(note, x + 8, y + 20) }
    if (img) { const iw = 120, ih = Math.min(54, img.height / img.width * iw); ctx.drawImage(img, x + 8, y + 30, iw, ih) }
  }
  drawBox(M, 'Le loueur — Alpes & Sound Location', '', imgL)
  drawBox(M + boxW + 30, 'Le client', estDevis ? 'Bon pour accord' : 'Précédé de « Lu et approuvé »', imgC)
  y += boxH + 16

  const usedH = Math.min(H, y + 8)
  const fin = document.createElement('canvas'); fin.width = W * SC; fin.height = usedH * SC
  const fc = fin.getContext('2d')!; fc.fillStyle = '#fff'; fc.fillRect(0, 0, fin.width, fin.height)
  fc.drawImage(cv, 0, 0, W * SC, usedH * SC, 0, 0, W * SC, usedH * SC)
  return fin
}

async function genererPDFBlob(c: Doc, sigLoueur: string | null) {
  const canvas = await dessinerContrat(c, sigLoueur)
  const dataURL = canvas.toDataURL('image/jpeg', 0.9)
  const bin = atob(dataURL.split(',')[1])
  const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  const pdf = jpegVersPDF(bytes, canvas.width, canvas.height)
  return new Blob([pdf.buffer as ArrayBuffer], { type: 'application/pdf' })
}
function nomFichier(c: Doc) {
  const n = `${c.client.prenom}-${c.client.nom}`.trim().replace(/\s+/g, '-') || 'client'
  return `${c.type === 'devis' ? 'Devis' : 'Contrat'}-${c.numero}-${n}.pdf`
}
const estMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)

// ---------------------------------------------------------------- Zone de signature
function SignaturePad({ value, onChange }: { value: string | null; onChange: (img: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false); const last = useRef<{ x: number; y: number } | null>(null); const hasInk = useRef(false)
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return
    const ratio = window.devicePixelRatio || 1; const rect = canvas.getBoundingClientRect()
    if (rect.width === 0) return
    canvas.width = rect.width * ratio; canvas.height = rect.height * ratio
    const ctx = canvas.getContext('2d')!; ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#14213d'
    if (value) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, rect.width, rect.height); img.src = value; hasInk.current = true }
  }, [value])
  const pos = (e: React.MouseEvent | React.TouchEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const p = 'touches' in e ? e.touches[0] : (e as React.MouseEvent)
    return { x: p.clientX - r.left, y: p.clientY - r.top }
  }
  const start = (e: React.MouseEvent | React.TouchEvent) => { e.preventDefault(); drawing.current = true; last.current = pos(e) }
  const move = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing.current) return; e.preventDefault()
    const ctx = ref.current!.getContext('2d')!; const p = pos(e)
    ctx.beginPath(); ctx.moveTo(last.current!.x, last.current!.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last.current = p; hasInk.current = true
  }
  const end = () => { drawing.current = false }
  const clear = () => { const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); hasInk.current = false; onChange(null) }
  const save = () => { if (!hasInk.current) { alert('Dessine la signature avant de valider.'); return } onChange(ref.current!.toDataURL('image/png')) }
  return (
    <div>
      <canvas ref={ref} onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end}
        style={{ width: '100%', height: 150, background: '#fff', border: `2px ${value ? 'solid' : 'dashed'} ${value ? '#7A2540' : '#e0d8d5'}`, borderRadius: 10, touchAction: 'none', display: 'block' }} />
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary btn-sm" onClick={save}>Valider la signature</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>Effacer</button>
        {value && <span className="self-center text-sm font-medium text-green-700">Signé ✓</span>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Page principale
const brouillonVide = (): { type: 'devis' | 'contrat'; validite: string; client: Client; evt: Evt; sel: Record<string, { checked: boolean; qte: number; prix: string }>; ordre: string[]; opt: { install: string; remise: string; caution: string; acompte: string } } => ({
  type: 'contrat', validite: '30',
  client: { nom: '', prenom: '', tel: '', email: '', adresse: '' },
  evt: { debut: '', fin: '', tarif: '24h', lieu: '', mode: 'main_propre' },
  sel: {}, ordre: [], opt: { install: '', remise: '', caution: '500', acompte: '30' },
})

export function DevisPage() {
  const catalog = useCatalog()
  // Catalogue combiné : matériel à l'unité (hors pack_uniquement) + packs, depuis le site
  const items: CatItem[] = useMemo(() => {
    const out: CatItem[] = []
    catalog.products
      .filter((p) => p.visible && p.rental_mode !== 'pack_uniquement')
      .forEach((p) => out.push({ nom: p.name, desc: p.summary || p.description || '', p24: num(p.price_24h), pwe: num(p.price_weekend), caution: num(p.caution) }))
    catalog.packs
      .filter((p) => p.visible)
      .forEach((p) => out.push({ nom: 'Pack ' + p.name.replace(/^pack\s+/i, ''), desc: p.tagline || p.description || '', p24: num(p.price_24h), pwe: num(p.price_weekend), caution: num(p.caution) }))
    return out
  }, [catalog])

  const [sigLoueur, setSigLoueur] = useState<string | null>(() => store.get<string | null>('sigLoueur', null))
  const [contrats, setContrats] = useState<Doc[]>(() => store.get<Doc[]>('contrats', []))
  const [apercu, setApercu] = useState<Doc | null>(null)
  const [tab, setTab] = useState<'form' | 'histo' | 'sig'>('form')
  const [f, setF] = useState(brouillonVide())
  const [histQ, setHistQ] = useState(''); const [histFiltre, setHistFiltre] = useState<'tous' | 'devis' | 'contrat'>('tous')
  const [msg, setMsg] = useState('')

  useEffect(() => { store.set('sigLoueur', sigLoueur) }, [sigLoueur])
  useEffect(() => { store.set('contrats', contrats) }, [contrats])

  const idFor = (it: CatItem) => it.nom
  const ordered = useMemo(() => {
    const coches = items.filter((it) => f.sel[idFor(it)]?.checked).map(idFor)
    const ord = f.ordre.filter((id) => coches.includes(id))
    coches.forEach((id) => { if (!ord.includes(id)) ord.push(id) })
    return ord
  }, [items, f.sel, f.ordre])
  const lignes = useMemo<Ligne[]>(() => ordered.map((id) => {
    const it = items.find((x) => idFor(x) === id)!; const sel = f.sel[id]
    const base = f.evt.tarif === 'we' ? it.pwe : it.p24
    const pu = sel.prix === '' || sel.prix == null ? base : num(sel.prix)
    return { nom: it.nom, desc: it.desc, qte: sel.qte || 1, pu, montant: pu * (sel.qte || 1) }
  }), [ordered, items, f.sel, f.evt.tarif])
  const install = f.evt.mode === 'main_propre' ? 0 : num(f.opt.install)
  const remise = num(f.opt.remise)
  const total = Math.max(0, lignes.reduce((a, l) => a + l.montant, 0) + install - remise)

  const toggle = (id: string) => setF((s) => {
    const was = s.sel[id]?.checked
    const sel = { ...s.sel, [id]: { checked: !was, qte: s.sel[id]?.qte || 1, prix: s.sel[id]?.prix ?? '' } }
    let ordre = s.ordre.slice()
    if (!was) { if (!ordre.includes(id)) ordre.push(id) } else ordre = ordre.filter((x) => x !== id)
    return { ...s, sel, ordre }
  })
  const setQte = (id: string, v: string) => setF((s) => ({ ...s, sel: { ...s.sel, [id]: { ...s.sel[id], qte: Math.max(1, parseInt(v) || 1) } } }))
  const setPrix = (id: string, v: string) => setF((s) => ({ ...s, sel: { ...s.sel, [id]: { ...s.sel[id], prix: v } } }))
  const deplacer = (id: string, sens: number) => setF((s) => {
    const ids = ordered.slice(); const i = ids.indexOf(id); const j = i + sens
    if (i < 0 || j < 0 || j >= ids.length) return s
    ;[ids[i], ids[j]] = [ids[j], ids[i]]; return { ...s, ordre: ids }
  })

  const generer = () => {
    if (!lignes.length) { alert('Coche au moins un matériel.'); return }
    const now = new Date(); const annee = now.getFullYear()
    const prefixe = f.type === 'devis' ? 'DEV' : 'ASL'
    const rx = new RegExp(`^${prefixe}-${annee}-(\\d+)$`)
    let max = 0; contrats.forEach((c) => { const m = (c.numero || '').match(rx); if (m) { const n = parseInt(m[1], 10); if (n > max) max = n } })
    const c: Doc = {
      id: Date.now(), type: f.type, validite: f.type === 'devis' ? num(f.validite) || 30 : null,
      numero: `${prefixe}-${annee}-${String(max + 1).padStart(3, '0')}`, dateEdit: now.toLocaleDateString('fr-FR'), dateISO: now.toISOString(),
      client: { ...f.client }, evt: { ...f.evt }, lignes, install, remise, total,
      caution: num(f.opt.caution), acomptePct: num(f.opt.acompte), sigClient: null,
    }
    setContrats((cs) => [c, ...cs]); setApercu(c); setF(brouillonVide())
  }
  const reprendre = (src: Doc) => {
    const sel: Record<string, { checked: boolean; qte: number; prix: string }> = {}; const ordre: string[] = []
    src.lignes.forEach((l) => {
      const it = items.find((x) => x.nom.trim().toLowerCase() === l.nom.trim().toLowerCase())
      const base = it ? (src.evt.tarif === 'we' ? it.pwe : it.p24) : l.pu
      const id = it ? it.nom : l.nom
      sel[id] = { checked: true, qte: l.qte || 1, prix: l.pu === base ? '' : String(l.pu) }
      ordre.push(id)
    })
    setF({
      type: src.type, validite: src.validite ? String(src.validite) : '30',
      client: {
        nom: src.client?.nom ?? '', prenom: src.client?.prenom ?? '', tel: src.client?.tel ?? '',
        email: src.client?.email ?? '', adresse: src.client?.adresse ?? '',
      },
      evt: {
        debut: src.evt?.debut ?? '', fin: src.evt?.fin ?? '', tarif: src.evt?.tarif ?? '24h',
        lieu: src.evt?.lieu ?? '', mode: src.evt?.mode ?? 'main_propre',
      },
      sel, ordre, opt: { install: src.install ? String(src.install) : '', remise: src.remise ? String(src.remise) : '', caution: String(src.caution ?? 500), acompte: String(src.acomptePct ?? 30) },
    })
    setApercu(null); setTab('form')
    setMsg('Document repris. Modifie-le puis régénère : un nouveau numéro sera créé, l\'original est conservé.')
  }

  // ---- Actions document (PDF / email) ----
  const telechargerPDF = async (c: Doc) => {
    try {
      const blob = await genererPDFBlob(c, sigLoueur)
      const file = new File([blob], nomFichier(c), { type: 'application/pdf' })
      const navAny = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
      if (navAny.canShare && navAny.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: nomFichier(c) }); return } catch (e) { if ((e as Error).name === 'AbortError') return }
      }
      const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = nomFichier(c)
      document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(() => URL.revokeObjectURL(url), 5000)
    } catch (e) { alert('Échec PDF : ' + ((e as Error).message || e)) }
  }
  const preparerEmail = (c: Doc) => {
    const nom = `${c.client.prenom} ${c.client.nom}`.trim()
    const mot = c.type === 'devis' ? 'devis' : 'contrat de location'
    const ac = c.total * c.acomptePct / 100
    const objet = `Votre ${mot} ${c.numero} — Alpes & Sound Location`
    const corps = `Bonjour ${nom},\n\nVeuillez trouver votre ${mot} ${c.numero} pour la prestation ${formatPeriode(c.evt.debut, c.evt.fin)}.\n\nRécapitulatif :\n- Montant total : ${fmt(c.total)} €\n- Acompte (${c.acomptePct}%) : ${fmt(ac)} €\n- Caution : ${fmt(c.caution)} €\n\nRèglement de l'acompte (${fmt(ac)} €) :\n- Wero : au ${PAIEMENT.weroTel} (${PAIEMENT.titulaire})\n- Virement : ${PAIEMENT.titulaire}\n  IBAN ${PAIEMENT.iban}\n  BIC ${PAIEMENT.bic}\n\nLe ${c.type === 'devis' ? 'devis' : 'contrat'} au format PDF est joint à ce message.\n\nCordialement,\n${ENTREPRISE.contact}\n${ENTREPRISE.nom}\n${ENTREPRISE.tel}`
    const to = c.client.email || ''
    const url = estMobile
      ? `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
      : `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}&su=${encodeURIComponent(objet)}&body=${encodeURIComponent(corps)}`
    const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  // ---- Rendu ----
  if (apercu) return <Apercu c={apercu} sigLoueur={sigLoueur} onBack={() => setApercu(null)}
    onSign={(img) => { const u = { ...apercu, sigClient: img }; setApercu(u); setContrats((cs) => cs.map((x) => (x.id === u.id ? u : x))) }}
    onPDF={() => telechargerPDF(apercu)} onEmail={() => preparerEmail(apercu)} />

  const devis = f.type === 'devis'
  return (
    <div className="wrap py-6">
      <AdminTitle title="Devis & Contrats" />
      <div className="mb-5 flex flex-wrap gap-2">
        {([['form', 'Nouveau'], ['histo', 'Historique'], ['sig', 'Ma signature']] as const).map(([k, l]) => (
          <button key={k} type="button" className={`btn btn-sm ${tab === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {msg && <div className="mb-4 rounded-[10px] border border-green-300 bg-green-50 px-4 py-3 text-sm text-green-800">{msg} <button className="float-right font-bold" onClick={() => setMsg('')}>✕</button></div>}

      {tab === 'form' && (
        <div className="grid gap-4">
          <section className="card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Type de document</h3>
            <div className="flex gap-2">
              {([['contrat', '📄 Contrat'], ['devis', '🧾 Devis']] as const).map(([k, l]) => (
                <button key={k} type="button" className={`flex-1 rounded-[10px] py-3 font-bold ${f.type === k ? 'bg-bordeaux text-white' : 'border border-line text-ink-3'}`} onClick={() => setF((s) => ({ ...s, type: k }))}>{l}</button>
              ))}
            </div>
            {devis && <div className="mt-3"><label className="mb-1 block text-xs font-semibold">Validité du devis (jours)</label><input type="number" className="input" value={f.validite} onChange={(e) => setF((s) => ({ ...s, validite: e.target.value }))} /></div>}
          </section>

          <section className="card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Le client</h3>
            <div className="grid grid-cols-2 gap-3">
              <Inp label="Nom" v={f.client.nom} on={(v) => setF((s) => ({ ...s, client: { ...s.client, nom: v } }))} />
              <Inp label="Prénom" v={f.client.prenom} on={(v) => setF((s) => ({ ...s, client: { ...s.client, prenom: v } }))} />
              <Inp label="Téléphone" v={f.client.tel} on={(v) => setF((s) => ({ ...s, client: { ...s.client, tel: v } }))} />
              <Inp label="Email" v={f.client.email} on={(v) => setF((s) => ({ ...s, client: { ...s.client, email: v } }))} />
            </div>
            <Inp label="Adresse" v={f.client.adresse} on={(v) => setF((s) => ({ ...s, client: { ...s.client, adresse: v } }))} />
          </section>

          <section className="card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">L'événement</h3>
            <div className="grid grid-cols-3 gap-3">
              <Inp label="Début" type="date" v={f.evt.debut} on={(v) => setF((s) => ({ ...s, evt: { ...s.evt, debut: v } }))} />
              <Inp label="Fin" type="date" v={f.evt.fin} on={(v) => setF((s) => ({ ...s, evt: { ...s.evt, fin: v } }))} />
              <div><label className="mb-1 block text-xs font-semibold">Tarif</label>
                <select className="input" value={f.evt.tarif} onChange={(e) => setF((s) => ({ ...s, evt: { ...s.evt, tarif: e.target.value as '24h' | 'we' } }))}><option value="24h">24h</option><option value="we">Week-end</option></select></div>
            </div>
            <Inp label="Lieu (si différent de l'adresse client)" v={f.evt.lieu} on={(v) => setF((s) => ({ ...s, evt: { ...s.evt, lieu: v } }))} />
            <div><label className="mb-1 block text-xs font-semibold">Remise du matériel</label>
              <select className="input" value={f.evt.mode} onChange={(e) => setF((s) => ({ ...s, evt: { ...s.evt, mode: e.target.value } }))}>
                <option value="main_propre">Remise en main propre</option><option value="livraison">Livraison</option><option value="livraison_install">Livraison + installation / démontage</option>
              </select></div>
          </section>

          <section className="card p-4">
            <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-3">Matériel loué</h3>
            <p className="mb-3 text-xs text-ink-3">Coché depuis le catalogue du site. Tu peux ajuster le prix juste pour ce document.</p>
            {!items.length ? <p className="py-4 text-center text-sm text-ink-3">Aucun matériel visible sur le site.</p> :
              items.map((it) => {
                const id = idFor(it); const sel = f.sel[id]; const coche = !!sel?.checked
                const base = f.evt.tarif === 'we' ? it.pwe : it.p24
                const modif = coche && sel.prix !== '' && sel.prix != null && num(sel.prix) !== base
                return (
                  <div key={id} className="border-b border-line py-2.5 last:border-0">
                    <label className="flex items-center gap-2.5">
                      <input type="checkbox" checked={coche} onChange={() => toggle(id)} className="size-5 accent-bordeaux" />
                      <span className="text-[15px] font-medium">{it.nom} <span className="text-ink-3">· tarif {f.evt.tarif === 'we' ? 'week-end' : '24h'} : {base} €</span></span>
                    </label>
                    {coche && (
                      <div className="mt-2 grid grid-cols-[1fr_1fr] gap-2.5 pl-7">
                        <div><label className="text-xs">Quantité</label><input type="number" min={1} className="input text-center" value={sel.qte || 1} onChange={(e) => setQte(id, e.target.value)} /></div>
                        <div><label className="text-xs">Prix unitaire (€){modif ? ' ✏️' : ''}</label><input type="number" min={0} className={`input text-center ${modif ? 'border-bordeaux font-bold' : ''}`} value={sel.prix ?? ''} placeholder={String(base)} onChange={(e) => setPrix(id, e.target.value)} /></div>
                      </div>
                    )}
                  </div>
                )
              })}
          </section>

          {ordered.length >= 2 && (
            <section className="card p-4">
              <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-3">Ordre sur le document</h3>
              <p className="mb-3 text-xs text-ink-3">Range le matériel dans l'ordre d'apparition.</p>
              {ordered.map((id, i) => {
                const it = items.find((x) => idFor(x) === id); if (!it) return null
                return (
                  <div key={id} className="grid grid-cols-[28px_1fr_auto] items-center gap-2.5 border-b border-line py-2 last:border-0">
                    <span className="font-extrabold text-bordeaux">{i + 1}</span>
                    <b className="text-[15px]">{it.nom}</b>
                    <span className="flex gap-1.5">
                      <button type="button" className="btn btn-ghost btn-sm" disabled={i === 0} onClick={() => deplacer(id, -1)}>↑</button>
                      <button type="button" className="btn btn-ghost btn-sm" disabled={i === ordered.length - 1} onClick={() => deplacer(id, 1)}>↓</button>
                    </span>
                  </div>
                )
              })}
            </section>
          )}

          <section className="card p-4">
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-3">Options & ajustements</h3>
            <div className="grid grid-cols-2 gap-3">
              {f.evt.mode !== 'main_propre' && <Inp label="Frais de livraison / installation (€)" type="number" v={f.opt.install} on={(v) => setF((s) => ({ ...s, opt: { ...s.opt, install: v } }))} />}
              <Inp label="Remise commerciale (€)" type="number" v={f.opt.remise} on={(v) => setF((s) => ({ ...s, opt: { ...s.opt, remise: v } }))} />
              <Inp label="Caution (€)" type="number" v={f.opt.caution} on={(v) => setF((s) => ({ ...s, opt: { ...s.opt, caution: v } }))} />
              <Inp label="Acompte (% du total)" type="number" v={f.opt.acompte} on={(v) => setF((s) => ({ ...s, opt: { ...s.opt, acompte: v } }))} />
            </div>
          </section>

          <div className="flex items-center justify-between rounded-[12px] bg-bordeaux px-5 py-4 text-white">
            <span className="text-sm opacity-85">Total location</span><span className="text-2xl font-extrabold text-or-2">{fmt(total)} €</span>
          </div>
          <button type="button" className="btn btn-primary" onClick={generer}>{devis ? 'Générer le devis ▸' : 'Générer le contrat ▸'}</button>
        </div>
      )}

      {tab === 'histo' && (
        <Historique contrats={contrats} q={histQ} setQ={setHistQ} filtre={histFiltre} setFiltre={setHistFiltre}
          onOpen={(c) => setApercu(c)} onReprendre={reprendre} onDelete={(id) => setContrats((cs) => cs.filter((c) => c.id !== id))} />
      )}

      {tab === 'sig' && (
        <section className="card p-4">
          <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-3">Ma signature</h3>
          <p className="mb-3 text-xs text-ink-3">Dessine ta signature une fois. Elle est ajoutée sur chaque document.</p>
          <SignaturePad value={sigLoueur} onChange={setSigLoueur} />
        </section>
      )}
    </div>
  )
}

function Inp({ label, v, on, type = 'text' }: { label: string; v: string; on: (v: string) => void; type?: string }) {
  return <div className="mb-3"><label className="mb-1 block text-xs font-semibold">{label}</label><input type={type} className="input" value={v} onChange={(e) => on(e.target.value)} /></div>
}

function Historique({ contrats, q, setQ, filtre, setFiltre, onOpen, onReprendre, onDelete }: {
  contrats: Doc[]; q: string; setQ: (v: string) => void; filtre: 'tous' | 'devis' | 'contrat'; setFiltre: (v: 'tous' | 'devis' | 'contrat') => void
  onOpen: (c: Doc) => void; onReprendre: (c: Doc) => void; onDelete: (id: number) => void
}) {
  const [confirm, setConfirm] = useState<number | null>(null)
  const typeDe = (c: Doc) => c.type || 'contrat'
  const term = q.trim().toLowerCase()
  const list = contrats.filter((c) => {
    if (filtre !== 'tous' && typeDe(c) !== filtre) return false
    if (!term) return true
    const n = `${c.client.prenom} ${c.client.nom}`.toLowerCase(); const d = `${c.dateEdit} ${frDate(c.evt.debut) || ''} ${c.numero}`.toLowerCase()
    return n.includes(term) || d.includes(term)
  })
  const nbD = contrats.filter((c) => typeDe(c) === 'devis').length
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {([['tous', `Tous (${contrats.length})`], ['contrat', `Contrats (${contrats.length - nbD})`], ['devis', `Devis (${nbD})`]] as const).map(([k, l]) => (
          <button key={k} type="button" className={`btn btn-sm ${filtre === k ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFiltre(k)}>{l}</button>
        ))}
      </div>
      <input className="input mb-4" placeholder="🔍  Rechercher un client, une date, un n°…" value={q} onChange={(e) => setQ(e.target.value)} />
      {!contrats.length ? <p className="py-4 text-center text-sm text-ink-3">Rien pour l'instant.</p> :
        !list.length ? <p className="py-4 text-center text-sm text-ink-3">Aucun résultat.</p> :
          list.map((c) => {
            const devis = typeDe(c) === 'devis'
            return (
              <div key={c.id} className="card mb-2.5 flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full px-2 py-0.5 text-[11px] font-bold uppercase text-white" style={{ background: devis ? '#B98A34' : '#7A2540' }}>{devis ? 'Devis' : 'Contrat'}</span>
                    <b>{`${c.client.prenom} ${c.client.nom}`.trim() || 'Client sans nom'}</b>
                  </div>
                  <div className="mt-1 text-sm text-ink-3">{c.numero} · édité le {c.dateEdit} · {formatPeriode(c.evt.debut, c.evt.fin)}</div>
                  <div className="mt-1 text-sm"><b>{fmt(c.total)} €</b> {c.sigClient ? <span className="ml-2 text-green-700">● Signé</span> : <span className="ml-2 text-ink-3">○ Non signé</span>}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => onOpen(c)}>Ouvrir</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => onReprendre(c)}>Reprendre</button>
                  {confirm === c.id ? (
                    <>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => { onDelete(c.id); setConfirm(null) }}>Confirmer ✓</button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirm(null)}>Annuler</button>
                    </>
                  ) : <button type="button" className="btn btn-ghost btn-sm text-red-600" onClick={() => setConfirm(c.id)}>Supprimer</button>}
                </div>
              </div>
            )
          })}
    </div>
  )
}

function Apercu({ c, sigLoueur, onBack, onSign, onPDF, onEmail }: {
  c: Doc; sigLoueur: string | null; onBack: () => void; onSign: (img: string | null) => void; onPDF: () => void; onEmail: () => void
}) {
  const devis = c.type === 'devis'
  const dateValidite = devis && c.dateISO ? new Date(new Date(c.dateISO).getTime() + (c.validite || 30) * 86400000).toLocaleDateString('fr-FR') : null
  const acompte = c.total * c.acomptePct / 100
  return (
    <div className="wrap py-6">
      <div className="mb-4 flex flex-wrap gap-2.5">
        <button type="button" className="btn btn-primary" onClick={onPDF}>⬇️ {estMobile ? 'PDF (Partager / Enregistrer)' : 'Télécharger le PDF'}</button>
        <button type="button" className="btn btn-gold" onClick={onEmail}>✉️ Email au client</button>
        <button type="button" className="btn btn-ghost" onClick={onBack}>◂ Retour</button>
      </div>
      {!c.client.email && <div className="mb-4 rounded-[10px] border border-or bg-amber-50 px-4 py-3 text-sm text-amber-900">⚠️ Pas d'email pour ce client : l'email s'ouvrira sans destinataire.</div>}
      <section className="card mb-4 p-4">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-ink-3">Signature du client</h3>
        <p className="mb-3 text-xs text-ink-3">Fais signer le client au doigt, puis valide.</p>
        <SignaturePad value={c.sigClient} onChange={onSign} />
      </section>

      <div className="mx-auto max-w-[800px] rounded-lg bg-white p-8 text-[13px] leading-normal text-ink shadow">
        <div className="flex items-start justify-between border-b-[3px] border-bordeaux pb-3.5">
          <div><img src={LOGO_LOCKUP} alt="ASL" className="mb-1.5 h-12" /><div className="text-[11px] text-ink-2">{ENTREPRISE.contact} · {ENTREPRISE.statut}<br />{ENTREPRISE.adresse}<br />{ENTREPRISE.tel} · {ENTREPRISE.email}<br />SIRET {ENTREPRISE.siret}</div></div>
          <div className="text-right"><div className="text-base font-extrabold uppercase tracking-wide text-bordeaux">{devis ? 'Devis' : 'Contrat de location'}</div><div className="text-xs text-ink-2">N° {c.numero}</div><div className="text-xs text-ink-2">Édité le {c.dateEdit}</div>{dateValidite && <div className="text-xs font-semibold text-bordeaux">Valable jusqu'au {dateValidite}</div>}</div>
        </div>
        <div className="my-4 grid grid-cols-2 gap-[18px]">
          <div><h4 className="mb-1.5 border-b border-line pb-1 text-[10px] font-bold uppercase tracking-wide text-bordeaux">Client</h4><p className="text-xs"><b>{`${c.client.prenom} ${c.client.nom}`.trim() || '—'}</b></p>{c.client.adresse && <p className="text-xs">{c.client.adresse}</p>}{c.client.tel && <p className="text-xs">Tél : {c.client.tel}</p>}{c.client.email && <p className="text-xs">{c.client.email}</p>}</div>
          <div><h4 className="mb-1.5 border-b border-line pb-1 text-[10px] font-bold uppercase tracking-wide text-bordeaux">Prestation</h4><p className="text-xs"><b>Période :</b> {formatPeriode(c.evt.debut, c.evt.fin)}</p><p className="text-xs"><b>Tarif :</b> {c.evt.tarif === 'we' ? 'Week-end' : '24h'}</p><p className="text-xs"><b>Remise :</b> {labelMode(c.evt.mode)}</p>{c.evt.lieu && <p className="text-xs"><b>Lieu :</b> {c.evt.lieu}</p>}</div>
        </div>
        <table className="my-3 w-full border-collapse text-xs">
          <thead><tr>{['Matériel', 'Qté', 'P.U.', 'Montant'].map((h, i) => <th key={h} className={`bg-bordeaux px-2.5 py-2 text-[10px] uppercase text-white ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {c.lignes.map((l, i) => <tr key={i}><td className="border-b border-line px-2.5 py-2">{l.nom}{l.desc && <small className="block text-[10px] text-ink-3">{l.desc}</small>}</td><td className="border-b border-line px-2.5 py-2 text-center">{l.qte}</td><td className="border-b border-line px-2.5 py-2 text-right">{fmt(l.pu)} €</td><td className="border-b border-line px-2.5 py-2 text-right">{fmt(l.montant)} €</td></tr>)}
            {c.install > 0 && <tr><td className="border-b border-line px-2.5 py-2">Livraison / installation</td><td className="border-b border-line px-2.5 py-2 text-center">1</td><td className="border-b border-line px-2.5 py-2 text-right">{fmt(c.install)} €</td><td className="border-b border-line px-2.5 py-2 text-right">{fmt(c.install)} €</td></tr>}
            {c.remise > 0 && <tr><td className="border-b border-line px-2.5 py-2">Remise commerciale</td><td className="border-b border-line px-2.5 py-2" /><td className="border-b border-line px-2.5 py-2" /><td className="border-b border-line px-2.5 py-2 text-right">− {fmt(c.remise)} €</td></tr>}
          </tbody>
          <tfoot><tr><td colSpan={3} className="border-t-2 border-bordeaux px-2.5 pt-2.5 text-right text-sm font-extrabold">TOTAL À RÉGLER</td><td className="border-t-2 border-bordeaux px-2.5 pt-2.5 text-right text-sm font-extrabold">{fmt(c.total)} €</td></tr></tfoot>
        </table>
        <div className="my-4 grid grid-cols-2 gap-[18px]">
          <div><h4 className="mb-1.5 border-b border-line pb-1 text-[10px] font-bold uppercase tracking-wide text-bordeaux">Règlement</h4><p className="text-xs"><b>Acompte ({c.acomptePct}%) :</b> {fmt(acompte)} €</p><p className="text-xs"><b>Solde :</b> {fmt(c.total - acompte)} € (jour de l'installation)</p></div>
          <div><h4 className="mb-1.5 border-b border-line pb-1 text-[10px] font-bold uppercase tracking-wide text-bordeaux">Caution</h4><p className="text-xs"><b>{fmt(c.caution)} €</b> par chèque non encaissé</p><p className="text-xs">Restituée au démontage.</p></div>
        </div>
        <div className="my-3"><h4 className="mb-1.5 border-b border-line pb-1 text-[10px] font-bold uppercase tracking-wide text-bordeaux">Règlement de l'acompte</h4><p className="text-xs"><b>Wero :</b> au {PAIEMENT.weroTel} ({PAIEMENT.titulaire})</p><p className="text-xs"><b>Virement :</b> {PAIEMENT.titulaire} — IBAN {PAIEMENT.iban} — BIC {PAIEMENT.bic}</p></div>
        <div className="mt-4">
          <h4 className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-bordeaux">Conditions générales</h4>
          <ul className="list-disc pl-[18px] text-[10.5px] text-ink-2"><li>La réservation est effective après signature et versement de l'acompte de {c.acomptePct}% du montant total.</li><li>Le solde est à régler au plus tard le jour de l'installation.</li><li>Une caution de {fmt(c.caution)} € est demandée lors de l'installation (chèque non encaissé), restituée au démontage.</li><li>Le client est responsable du matériel pendant toute la durée de mise à disposition (vol, casse, détérioration).</li></ul>
          <h4 className="mb-1.5 mt-2 text-[11px] font-bold uppercase tracking-wide text-bordeaux">Conditions d'annulation</h4>
          <ul className="list-disc pl-[18px] text-[10.5px] text-ink-2"><li>Annulation plus de 7 jours avant l'événement : acompte conservé.</li><li>Annulation moins de 7 jours avant l'événement : totalité de la prestation due.</li></ul>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-6">
          <div className="min-h-[88px] rounded-lg border border-line p-2.5"><div className="text-[10px] uppercase tracking-wide text-ink-3">Le loueur — Alpes & Sound Location</div>{sigLoueur ? <img src={sigLoueur} alt="" className="mt-1 max-h-[68px]" /> : <div className="text-[9.5px] text-ink-3">Signature non enregistrée</div>}</div>
          <div className="min-h-[88px] rounded-lg border border-line p-2.5"><div className="text-[10px] uppercase tracking-wide text-ink-3">Le client</div><div className="text-[9.5px] text-ink-3">{devis ? 'Bon pour accord' : 'Précédé de « Lu et approuvé »'}</div>{c.sigClient && <img src={c.sigClient} alt="" className="mt-1 max-h-[68px]" />}</div>
        </div>
        <div className="mt-5 border-t border-line pt-2.5 text-center text-[10px] text-ink-3">{ENTREPRISE.nom} — {ENTREPRISE.adresse} — SIRET {ENTREPRISE.siret} — {ENTREPRISE.tel}</div>
      </div>
    </div>
  )
}

