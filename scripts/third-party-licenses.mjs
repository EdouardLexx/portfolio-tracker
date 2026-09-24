// Gathers the licence notices of every production dependency, plus the Bun
// runtime compiled into the executables. MIT, Apache-2.0 and LGPL all require
// their notices to travel with redistributed copies; the file lands in dist/,
// so it is embedded in the executables and served by the app.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const OUT = 'dist/THIRD_PARTY_LICENSES.txt'
const SOURCE_URL = 'https://github.com/EdouardLexx/portfolio-tracker'
const NOTICE_FILE = /^(licen[cs]e|copying|notice)([.-].*)?$/i
const RULE = '='.repeat(78)

function isDir(path) {
  return statSync(path).isDirectory()
}

/**
 * Licence files at the package root; failing that, in its sub-folders, where
 * packages that vendor other libraries (victory-vendor and d3) keep theirs.
 */
function noticeFiles(dir, depth = 0) {
  const entries = readdirSync(dir)
  const own = entries
    .filter((name) => NOTICE_FILE.test(name) && !isDir(join(dir, name)))
    .map((name) => join(dir, name))
  if (own.length || depth >= 3) return own
  return entries
    .filter((name) => name !== 'node_modules' && isDir(join(dir, name)))
    .flatMap((name) => noticeFiles(join(dir, name), depth + 1))
}

// The lockfile flags development-only packages; reading it avoids spawning
// npm, whose executable is named differently on Windows.
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
const packages = Object.entries(lock.packages)
  .filter(([path, entry]) => path && !entry.dev && !entry.devOptional && existsSync(path))
  .map(([path, entry]) => {
    const meta = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'))
    return {
      path,
      name: meta.name,
      version: meta.version,
      license: meta.license ?? entry.license ?? 'non déclarée',
    }
  })
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))

const sections = packages.map(({ path, name, version, license }) => {
  const files = noticeFiles(path)
  const texts = files.length
    ? files.map((file) => {
        const label = file.slice(path.length + 1)
        return `--- ${label} ---\n${readFileSync(file, 'utf8').trim()}`
      })
    : [`Aucun texte de licence fourni par le paquet ; licence déclarée : ${license}.`]
  return `${RULE}\n${name}@${version} — ${license}\n${RULE}\n\n${texts.join('\n\n')}\n`
})

const bun = readFileSync('scripts/licenses/bun.md', 'utf8').trim()

const header = `Portefeuille — mentions de licences des composants tiers
Généré par scripts/third-party-licenses.mjs. Ne pas modifier à la main.

Portefeuille est un logiciel libre distribué sous licence GNU AGPL v3.0 ou
ultérieure, © 2026 EdouardLexx. Code source complet : ${SOURCE_URL}

Il inclut les composants ci-dessous, chacun sous sa propre licence.

${RULE}
Bun — moteur JavaScript intégré aux exécutables
${RULE}

Les exécutables sont compilés avec Bun, qui embarque JavaScriptCore (WebKit)
sous LGPL. Le code source complet de Portefeuille étant public, chacun peut
remplacer Bun ou JavaScriptCore et refabriquer l'application avec
\`npm run package\` (voir le README).

${bun}
`

writeFileSync(OUT, `${header}\n${sections.join('\n')}`)
console.log(`${packages.length} composants tiers + Bun → ${OUT}`)
