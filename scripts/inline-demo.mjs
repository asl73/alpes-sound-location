// Assemble l'aperçu de démonstration en un seul fichier HTML autonome (dist-demo/apercu.html).
import fs from 'node:fs'
import path from 'node:path'

const dir = 'dist-demo'
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8')
const read = (href) => fs.readFileSync(path.join(dir, href.replace(/^\//, '')), 'utf8')

const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>/g)].map((m) => read(m[1])).join('\n')
const js = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/g)].map((m) => read(m[1])).join('\n')
// Les caractères accentués sont échappés : le fichier reste valide quel que soit l'encodage annoncé.
const asciiJs = (code) => code.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'))
const asciiCss = (code) => code.replace(/[^\x00-\x7f]/g, (c) => '\\' + c.charCodeAt(0).toString(16) + ' ')
const favicon = 'data:image/svg+xml;base64,' + fs.readFileSync('public/favicon.svg').toString('base64')

const out = `<title>Site Alpes & Sound Location</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="icon" href="${favicon}" type="image/svg+xml">
<style>
${asciiCss(css)}
</style>
<div id="root"></div>
<script type="module">
${asciiJs(js).replace(/<\/script/gi, '<\\/script')}
</script>
`
fs.writeFileSync(path.join(dir, 'apercu.html'), out)
console.log(`apercu.html : ${(out.length / 1024).toFixed(0)} Ko`)
