/**
 * Executes every `ruby runnable` code fence in the content and fails if any of
 * them does not run cleanly.
 *
 * Why this exists: a `runnable` fence is a promise to the learner that clicking
 * Run produces the output the prose claims. Each one executes on its own, in a
 * fresh VM, so a fence that quietly depends on a helper defined in an earlier
 * fence works while you are writing the lesson and raises NameError for the
 * first person who reads it. That is exactly the bug this script caught on the
 * loops lesson, and nothing else in the pipeline can see it: the validator
 * checks structure, not behaviour, and the Ruby only runs in a browser.
 *
 * It needs a local `ruby` on PATH. Without one it skips rather than fails, so
 * contributors without Ruby installed are not blocked — CI pins 3.4 and is the
 * authority.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { globSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const PER_FENCE_TIMEOUT_MS = 60_000

const probe = spawnSync('ruby', ['-v'], { encoding: 'utf8' })
if (probe.error) {
  console.log('• no `ruby` on PATH — skipping runnable-fence checks')
  process.exit(0)
}
console.log(`• ${probe.stdout.trim()}`)

const files = globSync('content/**/lesson.md').sort()
const dir = mkdtempSync(join(tmpdir(), 'rubiq-fences-'))
let checked = 0
const failures = []

// Matches ```ruby …runnable… up to the closing fence.
const FENCE = /^```ruby[^\n]*\brunnable\b[^\n]*\n([\s\S]*?)^```$/gm

try {
  for (const file of files) {
    const body = readFileSync(file, 'utf8')
    let match
    let index = 0
    while ((match = FENCE.exec(body)) !== null) {
      index += 1
      checked += 1
      const source = match[1]
      const path = join(dir, `fence-${checked}.rb`)
      writeFileSync(path, source)
      const run = spawnSync('ruby', [path], {
        encoding: 'utf8',
        timeout: PER_FENCE_TIMEOUT_MS,
      })
      if (run.status !== 0) {
        const line = (run.stderr || run.error?.message || 'unknown failure')
          .split('\n')
          .find((l) => l.trim())
          ?.replace(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), 'fence')
        failures.push({ file, index, reason: line ?? 'no output', source })
      }
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

for (const f of failures) {
  console.error(`\n✘ ${f.file} — runnable fence #${f.index}`)
  console.error(`  ${f.reason}`)
  console.error(
    f.source
      .trimEnd()
      .split('\n')
      .slice(0, 12)
      .map((l) => `    ${l}`)
      .join('\n'),
  )
}

if (failures.length > 0) {
  console.error(
    `\n✘ ${failures.length} of ${checked} runnable ruby fences failed to execute`,
  )
  process.exit(1)
}
console.log(`✔ ${checked} runnable ruby fences execute cleanly`)
