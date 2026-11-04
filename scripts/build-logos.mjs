// Régénère les logos vectoriels (texte vectorisé, sans dépendance à une police)
// à partir des gabarits du logo validé. Usage : node scripts/build-logos.mjs
import opentype from 'opentype.js'
import fs from 'node:fs'

const buf = fs.readFileSync('/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf')
const font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))

function text(str, { x, y, size, spacing = 0, anchor = 'start' }) {
  const opts = { kerning: true, letterSpacing: spacing / size }
  let x0 = x
  if (anchor === 'middle') {
    const w = font.getAdvanceWidth(str, size, opts) - spacing
    x0 = x - w / 2
  }
  const p = font.getPath(str, x0, y, size, opts)
  return { d: p.toPathData(2), box: p.getBoundingBox() }
}

// Décale une polyligne "M x,y L x,y ..." de (dx, dy)
function shift(d, dx, dy) {
  return d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (_, a, b) => `${+(+a + dx).toFixed(2)},${+(+b + dy).toFixed(2)}`)
}

// ---------- Emblème (gabarit "embleme_compact", 240 x 240) ----------
const emblem = {
  viewBox: '0 0 240 240',
  circle: { cx: 120, cy: 120, r: 112, w: 4 },
  mountain: shift('M-56,26 L-30,-24 L-16,-2 L4,-40 L22,-8 L36,-26 L58,26 Z', 120, 108),
  mountainW: 4.5,
  wave: shift('M-50,12 L-38,12 L-31,-3 L-24,24 L-17,-16 L-9,26 L-2,-1 L4,12 L50,12', 120, 108),
  waveW: 3.5,
  text: text('ASL', { x: 120, y: 188, size: 58, spacing: 2, anchor: 'middle' }).d,
}

// ---------- Lockup horizontal (gabarit "logo_horizontal", 620 x 220) ----------
const name = text('ASL', { x: 210, y: 98, size: 70, spacing: 1 })
const sub1 = text('ALPES AND SOUND LOCATION', { x: 213, y: 130, size: 16, spacing: 2 })
const sub2 = text('SONORISATION · ÉCLAIRAGE', { x: 213, y: 152, size: 12, spacing: 3.5 })
const right = Math.ceil(Math.max(name.box.x2, sub1.box.x2, sub2.box.x2)) + 4
const lockup = {
  viewBox: `30 42 ${right - 30} 132`,
  circle: { cx: 96, cy: 108, r: 62, w: 2 },
  mountain: shift('M-40,18 L-21,-17 L-12,-3 L1,-28 L15,-8 L25,-19 L40,18 Z', 96, 94),
  mountainW: 2.4,
  wave: shift('M-35,7 L-27,7 L-22,-4 L-17,15 L-12,-12 L-6,16 L-2,-2 L1,7 L34,7', 96, 94),
  waveW: 2,
  emblemText: text('ASL', { x: 96, y: 154, size: 34, spacing: 1, anchor: 'middle' }).d,
  name: name.d,
  sub1: sub1.d,
  sub2: sub2.d,
}

fs.writeFileSync(
  'src/components/logoPaths.ts',
  `// Généré par scripts/build-logos.mjs — ne pas modifier à la main.\nexport const EMBLEM = ${JSON.stringify(emblem, null, 2)} as const\n\nexport const LOCKUP = ${JSON.stringify(lockup, null, 2)} as const\n`,
)

// ---------- Fichiers SVG prêts à l'emploi ----------
const palettes = {
  couleur: { main: '#7A2540', wave: '#B98A34', sub1: '#2A0E1A', sub2: '#B98A34' },
  'fond-sombre': { main: '#F5EAE0', wave: '#C99A45', sub1: '#E8D9CC', sub2: '#C99A45' },
  blanc: { main: '#FFFFFF', wave: '#FFFFFF', sub1: '#FFFFFF', sub2: '#FFFFFF' },
  noir: { main: '#1A1A1A', wave: '#1A1A1A', sub1: '#1A1A1A', sub2: '#1A1A1A' },
}

const emblemSvg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${emblem.viewBox}" width="240" height="240">
  <circle cx="${emblem.circle.cx}" cy="${emblem.circle.cy}" r="${emblem.circle.r}" fill="none" stroke="${c.main}" stroke-width="${emblem.circle.w}"/>
  <path d="${emblem.mountain}" fill="none" stroke="${c.main}" stroke-width="${emblem.mountainW}" stroke-linejoin="round"/>
  <path d="${emblem.wave}" fill="none" stroke="${c.wave}" stroke-width="${emblem.waveW}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${emblem.text}" fill="${c.main}"/>
</svg>
`
const [vx, vy, vw, vh] = lockup.viewBox.split(' ').map(Number)
const lockupSvg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${lockup.viewBox}" width="${vw * 2}" height="${vh * 2}">
  <circle cx="${lockup.circle.cx}" cy="${lockup.circle.cy}" r="${lockup.circle.r}" fill="none" stroke="${c.main}" stroke-width="${lockup.circle.w}"/>
  <path d="${lockup.mountain}" fill="none" stroke="${c.main}" stroke-width="${lockup.mountainW}" stroke-linejoin="round"/>
  <path d="${lockup.wave}" fill="none" stroke="${c.wave}" stroke-width="${lockup.waveW}" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="${lockup.emblemText}" fill="${c.main}"/>
  <path d="${lockup.name}" fill="${c.main}"/>
  <path d="${lockup.sub1}" fill="${c.sub1}"/>
  <path d="${lockup.sub2}" fill="${c.sub2}"/>
</svg>
`
void vx; void vy
for (const [key, c] of Object.entries(palettes)) {
  fs.writeFileSync(`public/brand/embleme-${key}.svg`, emblemSvg(c))
  fs.writeFileSync(`public/brand/logo-horizontal-${key}.svg`, lockupSvg(c))
}

// ---------- Favicon : emblème simplifié, lisible en 16 à 32 px ----------
const fav = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="31" fill="#7A2540"/>
  <path d="${shift('M-22,10 L-12,-9 L-6,0 L2,-15 L9,-3 L14,-10 L23,10 Z', 32, 34)}" fill="none" stroke="#F5EAE0" stroke-width="3.2" stroke-linejoin="round"/>
  <path d="${shift('M-19,4 L-14,4 L-11,-2 L-8,9 L-5,-7 L-1,10 L2,0 L4,4 L19,4', 32, 34)}" fill="none" stroke="#D9AE5C" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
</svg>
`
fs.writeFileSync('public/favicon.svg', fav)
console.log('Logos générés. Lockup viewBox:', lockup.viewBox)
