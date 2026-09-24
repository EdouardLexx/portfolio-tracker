// Builds one self-contained executable per platform. Bun cross-compiles, so a
// single machine (the CI's Linux runner) produces all of them.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync } from 'node:fs'

const TARGETS = [
  { target: 'bun-windows-x64', name: 'portfolio-tracker-windows-x64.exe' },
  { target: 'bun-darwin-arm64', name: 'portfolio-tracker-macos-arm64' },
  { target: 'bun-darwin-x64', name: 'portfolio-tracker-macos-x64' },
  { target: 'bun-linux-x64', name: 'portfolio-tracker-linux-x64' },
]

const bun = process.env.BUN || 'bun'

// The executables embed the Bun runtime: its licence notice, vendored in
// scripts/licenses/bun.md, must match the version actually compiling them.
const bunVersion = execFileSync(bun, ['--version'], { encoding: 'utf8' }).trim()
const noticeVersion = /^Bun (\S+)/.exec(readFileSync('scripts/licenses/bun.md', 'utf8'))?.[1]
if (bunVersion !== noticeVersion) {
  throw new Error(
    `Bun ${bunVersion} compile, mais scripts/licenses/bun.md décrit Bun ${noticeVersion} : ` +
      'mettre à jour ce fichier depuis https://github.com/oven-sh/bun/blob/bun-v<version>/LICENSE.md.'
  )
}

rmSync('release', { recursive: true, force: true })
mkdirSync('release')

for (const { target, name } of TARGETS) {
  console.log(`→ ${name}`)
  execFileSync(
    bun,
    ['build', 'server/standalone.js', '--compile', `--target=${target}`, `--outfile=release/${name}`],
    { stdio: 'inherit' }
  )
}
