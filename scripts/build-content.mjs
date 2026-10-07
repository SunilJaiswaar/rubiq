#!/usr/bin/env node
/**
 * Compiles content/ into src/generated/.
 *
 *   content/<track>/track.yml
 *   content/<track>/<NN>-<module>/module.yml
 *   content/<track>/<NN>-<module>/<NN>-<lesson>/lesson.md   (+ quiz.yml, exercise.yml)
 *
 * Outputs:
 *   catalog.json        tracks/modules/lesson stubs — eager, kept small
 *   lessons/<id>.json   one file per lesson — lazy, fetched on demand
 *   search-index.json   inverted index — lazy
 *   graph.json          concept prerequisite graph — lazy
 *   roadmaps.json       role-oriented learning paths
 *
 * Run via `npm run content:build`; `npm run dev` and `npm run build` do it for you.
 */
import { readFile, writeFile, mkdir, rm, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
// Named import, not default: js-yaml 5 is ESM-native and has no default export.
// This form works on both 4 and 5.
import { load as loadYamlString } from 'js-yaml'
import { createRenderer, splitFrontmatter, analyse } from './lib/markdown.mjs'
import { BLOCKS, MODES } from './lib/blocks.mjs'
import { tokenize, FIELD_IDS } from '../src/engines/search/tokenize.mjs'
import { expandSeed } from '../src/runners/seed.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')
const OUT = path.join(ROOT, 'src', 'generated')

const md = createRenderer()

/* ------------------------------------------------------------------ helpers */

const slugOf = (dirname) => dirname.replace(/^\d+[-_]/, '')
const orderOf = (dirname) => {
  const m = /^(\d+)/.exec(dirname)
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER
}

async function dirs(p) {
  if (!existsSync(p)) return []
  const entries = await readdir(p, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort((a, b) => orderOf(a) - orderOf(b) || a.localeCompare(b))
}

async function readYaml(file, { optional = false } = {}) {
  if (!existsSync(file)) {
    if (optional) return null
    throw new Error(`Missing required file: ${path.relative(ROOT, file)}`)
  }
  const text = await readFile(file, 'utf8')
  try {
    return loadYamlString(text) ?? {}
  } catch (err) {
    throw new Error(`Invalid YAML in ${path.relative(ROOT, file)}: ${err.message}`)
  }
}

/** Minutes of reading, from word count. 200 wpm, floored at 1. */
const readingMinutes = (text) => Math.max(1, Math.round(text.split(/\s+/).filter(Boolean).length / 200))

/* ------------------------------------------------------------------- lesson */

async function buildLesson({ trackSlug, moduleSlug, lessonDir, lessonPath }) {
  // The real path under content/, numeric prefixes and all. Emitted so the
  // "Improve this lesson" link points at the file that actually exists — guessing it
  // from the id would drop the ordering prefixes and 404.
  const sourcePath = path.relative(ROOT, lessonPath).split(path.sep).join('/')
  const lessonSlug = slugOf(lessonDir)
  const id = `${trackSlug}/${moduleSlug}/${lessonSlug}`

  const source = await readFile(path.join(lessonPath, 'lesson.md'), 'utf8')
  const { frontmatter, body } = splitFrontmatter(source)

  let meta
  try {
    meta = frontmatter ? (loadYamlString(frontmatter) ?? {}) : {}
  } catch (err) {
    throw new Error(`Invalid frontmatter in ${id}: ${err.message}`)
  }

  const { blocks, headings, text } = analyse(md, body)
  const html = md.render(body)

  const quiz = await readYaml(path.join(lessonPath, 'quiz.yml'), { optional: true })
  const exercise = await readYaml(path.join(lessonPath, 'exercise.yml'), { optional: true })
  // An optional in-lesson playground. For SQL lessons this is what makes the
  // `runnable` code fences actually runnable: the seed defines the tables they query.
  const playground = await readYaml(path.join(lessonPath, 'playground.yml'), { optional: true })

  // Which modes have anything to show for this lesson? Computed here so the reader
  // never offers a mode that would render an empty page.
  const availableModes = Object.entries(MODES)
    .filter(([name, spec]) => name === 'full' || spec.blocks.some((b) => blocks.includes(b)))
    .map(([name]) => name)

  const stub = {
    id,
    track: trackSlug,
    module: moduleSlug,
    slug: lessonSlug,
    title: meta.title ?? lessonSlug,
    summary: meta.summary ?? '',
    level: meta.level ?? 'beginner',
    order: orderOf(lessonDir),
    minutes: meta.minutes ?? readingMinutes(text),
    tags: meta.tags ?? [],
    concepts: meta.concepts ?? [],
    prerequisites: meta.prerequisites ?? [],
    blocks,
    modes: availableModes,
    hasQuiz: Boolean(quiz?.questions?.length),
    hasExercise: Boolean(exercise?.id),
    hasPlayground: Boolean(playground?.language),
    interviewCount: (meta.interview ?? []).length,
    sourcePath,
    route: `/learn/${trackSlug}/${lessonSlug}`,
  }

  const full = {
    ...stub,
    html,
    headings: headings.filter((h) => h.depth <= 3),
    quiz: quiz?.questions?.length
      ? { questions: quiz.questions.map(normaliseQuestion), passScore: quiz.passScore ?? 0.7 }
      : null,
    exercise: exercise?.id ? normaliseExercise(exercise) : null,
    playground: playground?.language
      ? {
          language: playground.language,
          starter: playground.starter ?? '',
          // The seed is emitted with its `generate:` specs INTACT. A 100,000-row
          // table expands to ~5 MB of JSON; the spec that produces it is ~400 bytes,
          // and the browser can expand it in milliseconds. Expanding here would blow
          // the performance budget for one lesson. `expandSeed` is called only to
          // fail the build on a spec that cannot expand.
          seed: playground.seed ? (expandSeed(playground.seed, id), playground.seed) : null,
          indexes: playground.indexes ?? {},
          notes: playground.notes ?? '',
        }
      : null,
    interview: meta.interview ?? [],
    resources: meta.resources ?? [],
    version: meta.version ?? null,
    lastReviewed: meta.last_reviewed ?? meta.lastReviewed ?? null,
    status: meta.status ?? 'draft',
    next: null, // filled in after the whole track is known
    previous: null,
  }

  return { stub, full, searchText: text, headings }
}

function normaliseQuestion(q, i) {
  const base = {
    id: q.id ?? `q${i + 1}`,
    kind: q.kind ?? (q.options ? 'choice' : 'recall'),
    prompt: q.prompt ?? '',
    explanation: q.explanation ?? '',
    concept: q.concept ?? null,
  }
  if (base.kind === 'choice' || base.kind === 'multi') {
    return {
      ...base,
      options: (q.options ?? []).map((o, j) => ({
        id: o.id ?? `o${j + 1}`,
        text: typeof o === 'string' ? o : o.text,
        correct: typeof o === 'string' ? false : Boolean(o.correct),
        feedback: typeof o === 'string' ? '' : (o.feedback ?? ''),
      })),
    }
  }
  if (base.kind === 'recall') {
    // Free-text "explain it in your own words". Graded against key points the
    // learner self-checks — no pretend AI marking.
    return { ...base, keyPoints: q.key_points ?? q.keyPoints ?? [], model: q.model ?? '' }
  }
  if (base.kind === 'order') {
    return { ...base, items: q.items ?? [] }
  }
  return base
}

function normaliseExercise(e) {
  return {
    id: e.id,
    language: e.language ?? 'javascript',
    title: e.title ?? 'Exercise',
    brief: e.brief ?? '',
    starter: e.starter ?? '',
    solution: e.solution ?? '',
    hints: e.hints ?? [],
    tests: (e.tests ?? []).map((t, i) => ({
      id: t.id ?? `t${i + 1}`,
      name: t.name ?? `Test ${i + 1}`,
      // `call` is evaluated against the learner's module; `expect` is deep-compared.
      call: t.call ?? '',
      expect: t.expect,
      hidden: Boolean(t.hidden),
    })),
    seed: e.seed ?? null, // SQL exercises: table definitions + rows
  }
}

/* -------------------------------------------------------------------- build */

async function build() {
  const startedAt = Date.now()
  await rm(OUT, { recursive: true, force: true })
  await mkdir(path.join(OUT, 'lessons'), { recursive: true })

  const tracks = []
  const allLessons = []
  const searchDocs = []

  for (const trackDir of await dirs(CONTENT)) {
    const trackPath = path.join(CONTENT, trackDir)
    const trackSlug = slugOf(trackDir)
    const trackMeta = await readYaml(path.join(trackPath, 'track.yml'))

    const modules = []
    for (const moduleDir of await dirs(trackPath)) {
      const modulePath = path.join(trackPath, moduleDir)
      const moduleSlug = slugOf(moduleDir)
      const moduleMeta = await readYaml(path.join(modulePath, 'module.yml'))

      const lessonStubs = []
      for (const lessonDir of await dirs(modulePath)) {
        const lessonPath = path.join(modulePath, lessonDir)
        if (!existsSync(path.join(lessonPath, 'lesson.md'))) continue

        const { stub, full, searchText, headings } = await buildLesson({
          trackSlug, moduleSlug, lessonDir, lessonPath,
        })
        lessonStubs.push(stub)
        allLessons.push(full)
        searchDocs.push({ stub, text: searchText, headings })
      }

      modules.push({
        slug: moduleSlug,
        title: moduleMeta.title ?? moduleSlug,
        summary: moduleMeta.summary ?? '',
        level: moduleMeta.level ?? 'beginner',
        order: orderOf(moduleDir),
        lessons: lessonStubs,
      })
    }

    const lessonCount = modules.reduce((n, m) => n + m.lessons.length, 0)
    const minutes = modules.reduce(
      (n, m) => n + m.lessons.reduce((k, l) => k + l.minutes, 0), 0,
    )

    tracks.push({
      slug: trackSlug,
      title: trackMeta.title ?? trackSlug,
      tagline: trackMeta.tagline ?? '',
      description: trackMeta.description ?? '',
      category: trackMeta.category ?? 'other',
      icon: trackMeta.icon ?? 'book',
      accent: trackMeta.accent ?? 'indigo',
      difficulty: trackMeta.difficulty ?? 'beginner',
      prerequisites: trackMeta.prerequisites ?? [],
      outcomes: trackMeta.outcomes ?? [],
      order: orderOf(trackDir),
      lessonCount,
      minutes,
      modules,
    })
  }

  // Link lessons in reading order, per track, so the reader always has a "next".
  for (const track of tracks) {
    const flat = track.modules.flatMap((m) => m.lessons)
    flat.forEach((stub, i) => {
      const full = allLessons.find((l) => l.id === stub.id)
      const prev = flat[i - 1]
      const next = flat[i + 1]
      if (prev) full.previous = { id: prev.id, title: prev.title, route: prev.route }
      if (next) full.next = { id: next.id, title: next.title, route: next.route }
    })
  }

  for (const lesson of allLessons) {
    const file = path.join(OUT, 'lessons', `${lesson.id.replace(/\//g, '__')}.json`)
    await writeFile(file, JSON.stringify(lesson))
  }

  const catalog = {
    generatedAt: new Date().toISOString(),
    blocks: BLOCKS,
    modes: MODES,
    tracks: tracks.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title)),
    totals: {
      tracks: tracks.length,
      lessons: allLessons.length,
      minutes: tracks.reduce((n, t) => n + t.minutes, 0),
      exercises: allLessons.filter((l) => l.exercise).length,
      quizzes: allLessons.filter((l) => l.quiz).length,
      interviewQuestions: allLessons.reduce((n, l) => n + l.interview.length, 0),
    },
  }
  await writeFile(path.join(OUT, 'catalog.json'), JSON.stringify(catalog))

  await writeFile(path.join(OUT, 'search-index.json'), JSON.stringify(buildSearchIndex(searchDocs)))
  await writeFile(path.join(OUT, 'graph.json'), JSON.stringify(buildGraph(allLessons, tracks)))

  const roadmaps = await readYaml(path.join(CONTENT, '_roadmaps.yml'), { optional: true })
  await writeFile(path.join(OUT, 'roadmaps.json'), JSON.stringify(roadmaps ?? { roadmaps: [] }))

  // A tiny barrel so the app imports typed data, never raw paths.
  await writeFile(
    path.join(OUT, 'index.ts'),
    [
      '// GENERATED by scripts/build-content.mjs — do not edit, do not commit.',
      "import catalog from './catalog.json'",
      "import roadmaps from './roadmaps.json'",
      "import type { Catalog, RoadmapFile } from '@/content/types'",
      'export const CATALOG = catalog as unknown as Catalog',
      'export const ROADMAPS = roadmaps as unknown as RoadmapFile',
      '',
    ].join('\n'),
  )

  const ms = Date.now() - startedAt
  console.log(
    `content: ${catalog.totals.tracks} tracks · ${catalog.totals.lessons} lessons · ` +
    `${catalog.totals.quizzes} quizzes · ${catalog.totals.exercises} exercises · ${ms}ms`,
  )
  return catalog
}

/* ------------------------------------------------------------ search index */

function buildSearchIndex(docs) {
  /** @type {Record<string, Array<[number, number, number]>>} postings: [docIdx, fieldId, tf] */
  const postings = {}
  const meta = []

  docs.forEach(({ stub, text, headings }, docIdx) => {
    meta.push({
      id: stub.id, title: stub.title, summary: stub.summary, route: stub.route,
      track: stub.track, level: stub.level, minutes: stub.minutes, blocks: stub.blocks,
    })

    const fields = [
      [FIELD_IDS.title, stub.title],
      [FIELD_IDS.summary, stub.summary],
      [FIELD_IDS.tag, [...stub.tags, ...stub.concepts].join(' ')],
      [FIELD_IDS.heading, headings.map((h) => h.text).join(' ')],
      [FIELD_IDS.body, text],
    ]

    for (const [fieldId, value] of fields) {
      const counts = new Map()
      for (const token of tokenize(String(value ?? ''))) {
        counts.set(token, (counts.get(token) ?? 0) + 1)
      }
      for (const [token, tf] of counts) {
        ;(postings[token] ??= []).push([docIdx, fieldId, tf])
      }
    }
  })

  return {
    docs: meta,
    postings,
    avgLength:
      docs.reduce((n, d) => n + tokenize(d.text).length, 0) / Math.max(1, docs.length),
  }
}

/* ------------------------------------------------------------ concept graph */

function buildGraph(lessons, tracks) {
  const nodes = new Map()

  const touch = (key, patch) => {
    const existing = nodes.get(key) ?? {
      id: key, label: key, kind: 'concept', lessons: [], prerequisites: [], next: [], track: null,
    }
    nodes.set(key, { ...existing, ...patch, lessons: existing.lessons, prerequisites: existing.prerequisites, next: existing.next })
    return nodes.get(key)
  }

  for (const track of tracks) {
    touch(`track:${track.slug}`, {
      label: track.title, kind: 'track', track: track.slug,
      prerequisites: track.prerequisites.map((p) => `track:${p}`),
    })
  }

  for (const lesson of lessons) {
    for (const concept of lesson.concepts) {
      const node = touch(`concept:${concept}`, { label: concept, kind: 'concept', track: lesson.track })
      node.lessons.push({ id: lesson.id, title: lesson.title, route: lesson.route })
    }
    for (const prereq of lesson.prerequisites) {
      // A prerequisite may be a lesson id or a concept name.
      const from = prereq.includes('/') ? `lesson:${prereq}` : `concept:${prereq}`
      for (const concept of lesson.concepts) {
        const node = nodes.get(`concept:${concept}`)
        if (node && !node.prerequisites.includes(from)) node.prerequisites.push(from)
      }
    }
  }

  // Derive forward edges from the prerequisite edges so the UI can walk both ways.
  for (const node of nodes.values()) {
    for (const prereq of node.prerequisites) {
      const target = nodes.get(prereq)
      if (target && !target.next.includes(node.id)) target.next.push(node.id)
    }
  }

  return { nodes: [...nodes.values()] }
}

build().catch((err) => {
  console.error(`\n✖ content build failed\n  ${err.message}\n`)
  process.exitCode = 1
})
