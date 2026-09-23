// Builds one self-contained executable per platform. Bun cross-compiles, so a
// single machine (the CI's Linux runner) produces all of them.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

const TARGETS = [
  { target: 'bun-windows-x64', name: 'portfolio-tracker-windows-x64.exe' },
  { target: 'bun-darwin-arm64', name: 'portfolio-tracker-macos-arm64' },
  { target: 'bun-darwin-x64', name: 'portfolio-tracker-macos-x64' },
  { target: 'bun-linux-x64', name: 'portfolio-tracker-linux-x64' },
]

const bun = process.env.BUN || 'bun'

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
