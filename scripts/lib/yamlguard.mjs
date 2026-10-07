#!/usr/bin/env node
/**
 * Catch the one YAML mistake that keeps happening in content: an unquoted scalar
 * containing ": ", which YAML reads as a nested mapping and rejects with a confusing
 * indentation error pointing at the wrong line.
 *
 * Run standalone (`node scripts/lib/yamlguard.mjs`) to list offenders. The content
 * validator parses the YAML properly and will catch these too — this exists because its
 * error message is much harder to act on than "quote line 98".
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Characters YAML reserves at the start of a plain scalar. A value beginning with one
 * of these must be quoted or written as a block scalar, or the parse fails — usually
 * with an "indentation" error pointing at the wrong place.
 *
 * The backtick is the one that bites in this project, because technical prose starts
 * with `code` constantly.
 */
const RESERVED_FIRST = new Set(['`', '@', '%', '!', '&', '*', '|', '>', '{', '[', '?', ':', '-', '#', ','])

/** Keys whose values are free prose and therefore likely to contain a colon. */
const PROSE_KEYS = [
  'feedback', 'text', 'prompt', 'name', 'title', 'summary', 'label', 'model',
  'brief', 'notes', 'goal', 'explanation', 'answer', 'hint', 'question', 'tagline',
  'description', 'milestone',
]

const LINE = new RegExp(
  `^(\\s*)(-\\s*)?(${PROSE_KEYS.join('|')}):[ \\t]+(.*)$`,
)

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else if (entry.name.endsWith('.yml') || entry.name.endsWith('.yaml')) yield full
  }
}

export async function findUnquotedColons(root = path.join(ROOT, 'content')) {
  const problems = []
  for await (const file of walk(root)) {
    const text = await readFile(file, 'utf8')
    text.split('\n').forEach((line, i) => {
      const m = LINE.exec(line)
      if (!m) return
      const value = m[4]
      if (!value) return

      const first = value[0]

      // Already quoted or an explicit block scalar — nothing to check.
      if (first === '"' || first === "'" || first === '|' || first === '>') return

      const add = (reason) =>
        problems.push({
          file: path.relative(ROOT, file),
          line: i + 1,
          key: m[3],
          value: value.slice(0, 70),
          reason,
        })

      if (RESERVED_FIRST.has(first)) {
        add(`starts with the YAML-reserved character "${first}"`)
        return
      }
      if (/: /.test(value) || /:$/.test(value.trimEnd())) {
        add('contains ": ", which YAML reads as a nested mapping')
      }
    })
  }
  return problems
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = await findUnquotedColons()
  for (const p of problems) {
    console.log(`${p.file}:${p.line}  [${p.key}]  ${p.reason}`)
    console.log(`    ${p.value}`)
  }
  if (problems.length) {
    console.error(
      `\n✖ ${problems.length} plain scalar(s) YAML cannot parse as intended.\n` +
      `  Wrap the value in double quotes, or use a >- block scalar.\n`,
    )
    process.exit(1)
  }
  console.log('✔ content YAML scalars are safe')
}
