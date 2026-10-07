#!/usr/bin/env node
/**
 * Content quality gate. Runs in CI on every pull request (and before `npm run build`).
 *
 * Errors block the build. Warnings are printed so a contributor is nudged toward a
 * better lesson without being locked out of contributing at all.
 *
 * Checks:
 *   - required frontmatter fields, and that `status`/`level` use known values
 *   - the pedagogical blocks every lesson must have (what, why, + one of example/how/realworld)
 *   - unknown block names (a typo like `:::internal` would otherwise render as a plain div)
 *   - duplicate lesson ids and duplicate quiz question ids
 *   - quizzes: at least one correct option, non-empty prompts, explanations present
 *   - exercises: a starter, at least one test, and a solution that the tests reference
 *   - internal links that point at lessons which do not exist
 *   - stale content (`last_reviewed` older than the staleness window)
 */
import { readFile, readdir } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import yaml from 'js-yaml'
import { splitFrontmatter, analyse, createRenderer } from './lib/markdown.mjs'
import { BLOCK_NAMES, REQUIRED_BLOCKS, REQUIRED_ONE_OF, ENCOURAGED_BLOCKS } from './lib/blocks.mjs'
import { expandSeed, GENERATOR_KINDS } from '../src/runners/seed.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')
const md = createRenderer()

const STALE_DAYS = 365
const LEVELS = ['beginner', 'basic', 'intermediate', 'advanced', 'expert']
const STATUSES = ['draft', 'review', 'stable', 'deprecated']

const errors = []
const warnings = []
const err = (where, msg) => errors.push(`${where}: ${msg}`)
const warn = (where, msg) => warnings.push(`${where}: ${msg}`)

const slugOf = (d) => d.replace(/^\d+[-_]/, '')
const orderOf = (d) => (/^(\d+)/.exec(d) ? Number(/^(\d+)/.exec(d)[1]) : Infinity)

async function dirs(p) {
  if (!existsSync(p)) return []
  const e = await readdir(p, { withFileTypes: true })
  return e.filter((x) => x.isDirectory() && !x.name.startsWith('.') && !x.name.startsWith('_'))
    .map((x) => x.name).sort((a, b) => orderOf(a) - orderOf(b))
}

function loadYaml(file) {
  if (!existsSync(file)) return null
  try {
    return yaml.load(readFileSync(file, 'utf8')) ?? {}
  } catch (e) {
    err(path.relative(ROOT, file), `invalid YAML — ${e.message}`)
    return null
  }
}

/* ------------------------------------------------------------------- checks */

function checkQuiz(where, quiz) {
  if (!quiz) return
  if (!Array.isArray(quiz.questions) || quiz.questions.length === 0) {
    err(where, 'quiz.yml exists but has no questions')
    return
  }
  const seen = new Set()
  quiz.questions.forEach((q, i) => {
    const qid = q.id ?? `q${i + 1}`
    const at = `${where} → quiz[${qid}]`
    if (seen.has(qid)) err(at, 'duplicate question id')
    seen.add(qid)

    if (!q.prompt || !String(q.prompt).trim()) err(at, 'missing prompt')

    const kind = q.kind ?? (q.options ? 'choice' : 'recall')
    if (!['choice', 'multi', 'recall', 'order'].includes(kind)) {
      err(at, `unknown question kind "${kind}"`)
    }

    if (kind === 'choice' || kind === 'multi') {
      const options = q.options ?? []
      if (options.length < 2) err(at, 'needs at least two options')
      const correct = options.filter((o) => typeof o === 'object' && o.correct)
      if (correct.length === 0) err(at, 'no option is marked correct')
      if (kind === 'choice' && correct.length > 1) {
        err(at, `kind "choice" has ${correct.length} correct options — use kind "multi"`)
      }
      options.forEach((o, j) => {
        if (typeof o === 'object' && !String(o.text ?? '').trim()) {
          err(at, `option ${j + 1} has no text`)
        }
      })
    }

    if (kind === 'recall') {
      const points = q.key_points ?? q.keyPoints ?? []
      if (points.length === 0) {
        err(at, 'recall questions need key_points for the learner to self-check against')
      }
    }

    if (kind === 'order' && (q.items ?? []).length < 2) {
      err(at, 'order questions need at least two items')
    }

    // An explanation is the whole point: a wrong answer must teach something.
    // For a recall question the model answer plays that role, so either satisfies this.
    const teaches = String(q.explanation ?? '').trim() || String(q.model ?? '').trim()
    if (!teaches) {
      warn(at, 'no explanation — a learner who gets this wrong learns nothing')
    }
  })
}

function checkExercise(where, ex) {
  if (!ex) return
  if (!ex.id) err(where, 'exercise.yml has no id')
  if (!String(ex.starter ?? '').trim()) err(where, 'exercise has no starter code')
  if (!Array.isArray(ex.tests) || ex.tests.length === 0) {
    err(where, 'exercise has no tests — nothing to check the learner against')
  }
  if (!String(ex.solution ?? '').trim()) {
    err(where, 'exercise has no reference solution')
  }
  if ((ex.hints ?? []).length === 0) {
    warn(where, 'exercise has no hints — a stuck learner has nowhere to go')
  }
  for (const t of ex.tests ?? []) {
    if (!String(t.call ?? '').trim()) err(where, `test "${t.name ?? t.id}" has no call`)
    if (t.expect === undefined) err(where, `test "${t.name ?? t.id}" has no expect value`)
  }
}

function checkPlayground(where, pg, body) {
  const runnableFences = [...body.matchAll(/^```(\w+)[^\n]*\brunnable\b/gm)].map((m) => m[1])
  if (!pg) {
    // A `runnable` sql fence with no seed would give the learner an empty database.
    if (runnableFences.includes('sql')) {
      err(where, 'has runnable SQL fences but no playground.yml to define the tables')
    }
    return
  }
  if (!pg.language) err(where, 'playground.yml has no language')
  if (pg.language === 'sql') {
    // Validate against the *expanded* seed, so a bad generator spec is caught here
    // rather than producing a confusing failure during the build.
    let expanded
    try {
      expanded = expandSeed(pg.seed, where)
    } catch (e) {
      err(where, e.message)
      return
    }
    for (const t of pg.seed?.tables ?? []) {
      if (!t.generate) continue
      for (const [i, c] of (t.generate.columns ?? []).entries()) {
        if (!GENERATOR_KINDS.includes(c?.kind)) {
          err(where, `table "${t.name}" generator column ${i + 1} has unknown kind "${c?.kind}" (known: ${GENERATOR_KINDS.join(', ')})`)
        }
      }
    }
    const tables = expanded?.tables
    if (!Array.isArray(tables) || tables.length === 0) {
      err(where, 'a SQL playground needs seed.tables')
      return
    }
    for (const t of tables) {
      if (!t.name) err(where, 'a seed table has no name')
      if (!Array.isArray(t.columns) || t.columns.length === 0) {
        err(where, `seed table "${t.name}" has no columns`)
        continue
      }
      if (!Array.isArray(t.rows)) {
        err(where, `seed table "${t.name}" has no rows`)
        continue
      }
      const width = t.columns.length
      t.rows.forEach((row, i) => {
        if (!Array.isArray(row)) {
          err(where, `seed table "${t.name}" row ${i + 1} is not a list`)
        } else if (row.length !== width) {
          err(where, `seed table "${t.name}" row ${i + 1} has ${row.length} values but ${width} columns`)
        }
      })
    }
    // Indexes must name real columns, or the index demo silently does nothing.
    for (const [table, columns] of Object.entries(pg.indexes ?? {})) {
      const def = tables.find((t) => t.name === table)
      if (!def) {
        err(where, `playground declares an index on unknown table "${table}"`)
        continue
      }
      for (const column of columns) {
        if (!def.columns.some((c) => c.name === column)) {
          err(where, `playground declares an index on "${table}.${column}", which is not a column`)
        }
      }
    }
  }
}

/* -------------------------------------------------------------------- walk */

const lessonIds = new Set()
const internalLinks = []
const trackSlugs = new Set()

for (const trackDir of await dirs(CONTENT)) {
  const trackPath = path.join(CONTENT, trackDir)
  const trackSlug = slugOf(trackDir)
  trackSlugs.add(trackSlug)
  const trackMeta = loadYaml(path.join(trackPath, 'track.yml'))

  if (!trackMeta) {
    err(`content/${trackDir}`, 'missing track.yml')
    continue
  }
  for (const field of ['title', 'description', 'category']) {
    if (!trackMeta[field]) err(`content/${trackDir}/track.yml`, `missing "${field}"`)
  }
  if (trackMeta.difficulty && !LEVELS.includes(trackMeta.difficulty)) {
    err(`content/${trackDir}/track.yml`, `difficulty must be one of ${LEVELS.join(', ')}`)
  }

  const moduleDirs = await dirs(trackPath)
  if (moduleDirs.length === 0) warn(`content/${trackDir}`, 'track has no modules')

  for (const moduleDir of moduleDirs) {
    const modulePath = path.join(trackPath, moduleDir)
    const moduleSlug = slugOf(moduleDir)
    const moduleMeta = loadYaml(path.join(modulePath, 'module.yml'))
    if (!moduleMeta) {
      err(`content/${trackDir}/${moduleDir}`, 'missing module.yml')
      continue
    }
    if (!moduleMeta.title) err(`content/${trackDir}/${moduleDir}/module.yml`, 'missing "title"')

    for (const lessonDir of await dirs(modulePath)) {
      const lessonPath = path.join(modulePath, lessonDir)
      const file = path.join(lessonPath, 'lesson.md')
      const rel = path.relative(ROOT, file)
      if (!existsSync(file)) {
        err(path.relative(ROOT, lessonPath), 'directory has no lesson.md')
        continue
      }

      const id = `${trackSlug}/${moduleSlug}/${slugOf(lessonDir)}`
      if (lessonIds.has(id)) err(rel, `duplicate lesson id "${id}"`)
      lessonIds.add(id)

      const source = await readFile(file, 'utf8')
      const { frontmatter, body } = splitFrontmatter(source)
      if (!frontmatter) {
        err(rel, 'no YAML frontmatter')
        continue
      }

      let meta
      try {
        meta = yaml.load(frontmatter) ?? {}
      } catch (e) {
        err(rel, `invalid frontmatter — ${e.message}`)
        continue
      }

      for (const field of ['title', 'summary']) {
        if (!meta[field]) err(rel, `frontmatter missing "${field}"`)
      }
      if (meta.level && !LEVELS.includes(meta.level)) {
        err(rel, `level "${meta.level}" is not one of ${LEVELS.join(', ')}`)
      }
      if (meta.status && !STATUSES.includes(meta.status)) {
        err(rel, `status "${meta.status}" is not one of ${STATUSES.join(', ')}`)
      }
      if (!meta.concepts || meta.concepts.length === 0) {
        warn(rel, 'no concepts declared — this lesson will not appear in the knowledge graph')
      }

      const reviewed = meta.last_reviewed ?? meta.lastReviewed
      if (!reviewed) {
        warn(rel, 'no last_reviewed date — readers cannot tell how current this is')
      } else {
        const age = (Date.now() - new Date(reviewed).getTime()) / 86_400_000
        if (Number.isNaN(age)) err(rel, `last_reviewed "${reviewed}" is not a valid date`)
        else if (age > STALE_DAYS) warn(rel, `last reviewed ${Math.round(age)} days ago — may be stale`)
      }

      // --- blocks ---
      const { blocks, text } = analyse(md, body)

      // Catch `:::internal` style typos: a container markdown-it does not know about
      // silently renders as a paragraph, so the author never sees their block vanish.
      // `[ \t]*` rather than `\s*`: a closing `:::` followed by a newline and a
      // paragraph must not be read as a container named after that paragraph's first word.
      for (const m of body.matchAll(/^:::[ \t]*([a-zA-Z][\w-]*)/gm)) {
        if (!BLOCK_NAMES.includes(m[1])) {
          err(rel, `unknown block ":::${m[1]}" — see scripts/lib/blocks.mjs for the vocabulary`)
        }
      }

      for (const required of REQUIRED_BLOCKS) {
        if (!blocks.includes(required)) {
          err(rel, `missing required block ":::${required}"`)
        }
      }
      for (const group of REQUIRED_ONE_OF) {
        if (!group.some((b) => blocks.includes(b))) {
          err(rel, `needs at least one of: ${group.map((b) => `:::${b}`).join(', ')}`)
        }
      }
      for (const nice of ENCOURAGED_BLOCKS) {
        if (!blocks.includes(nice)) warn(rel, `consider adding a ":::${nice}" block`)
      }

      if (text.split(/\s+/).length < 120) {
        warn(rel, 'under 120 words — likely a stub')
      }

      // --- links ---
      for (const m of body.matchAll(/\]\((\/[^)\s]+)\)/g)) {
        internalLinks.push({ from: rel, href: m[1] })
      }

      checkQuiz(rel, loadYaml(path.join(lessonPath, 'quiz.yml')))
      checkExercise(rel, loadYaml(path.join(lessonPath, 'exercise.yml')))
      checkPlayground(rel, loadYaml(path.join(lessonPath, 'playground.yml')), body)
    }
  }
}

/* -------------------------------------------------------- cross-references */

const lessonRoutes = new Set()
for (const id of lessonIds) {
  const [track, , slug] = id.split('/')
  lessonRoutes.add(`/learn/${track}/${slug}`)
}
const STATIC_ROUTES = new Set([
  '/', '/learn', '/roadmaps', '/practice', '/projects', '/interview', '/search',
  '/progress', '/playground', '/review', '/graph', '/contribute', '/about',
])

for (const { from, href } of internalLinks) {
  const clean = href.split('#')[0].replace(/\/$/, '') || '/'
  if (lessonRoutes.has(clean) || STATIC_ROUTES.has(clean)) continue
  if (clean.startsWith('/learn/') && trackSlugs.has(clean.split('/')[2])) continue
  err(from, `internal link "${href}" does not resolve to any lesson or page`)
}

// Roadmaps must reference tracks that exist.
const roadmapFile = path.join(CONTENT, '_roadmaps.yml')
if (existsSync(roadmapFile)) {
  const data = loadYaml(roadmapFile)
  for (const rm of data?.roadmaps ?? []) {
    if (!rm.id || !rm.title) err('content/_roadmaps.yml', `roadmap missing id or title`)
    for (const stage of rm.stages ?? []) {
      for (const ref of stage.tracks ?? []) {
        if (!trackSlugs.has(ref)) {
          err('content/_roadmaps.yml', `roadmap "${rm.id}" references unknown track "${ref}"`)
        }
      }
    }
  }
}

/* ------------------------------------------------------------------ report */

if (warnings.length) {
  console.log(`\n⚠  ${warnings.length} warning${warnings.length === 1 ? '' : 's'}`)
  for (const w of warnings) console.log(`   ${w}`)
}

if (errors.length) {
  console.error(`\n✖ ${errors.length} error${errors.length === 1 ? '' : 's'} — content build blocked`)
  for (const e of errors) console.error(`   ${e}`)
  console.error('')
  process.exit(1)
}

console.log(`\n✔ content valid — ${lessonIds.size} lessons, ${trackSlugs.size} tracks, ${warnings.length} warnings\n`)
