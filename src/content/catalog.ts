/**
 * The only module that knows how generated content is laid out on disk.
 *
 * Everything above this layer asks for a lesson by id and gets a typed `Lesson`.
 * Lesson bodies are fetched lazily — one network request per lesson — so the initial
 * bundle carries the index and nothing else.
 */
import { CATALOG, ROADMAPS } from '~generated/index'
import type {
  Catalog, Graph, Lesson, LessonStub, Module, Roadmap, Track,
} from './types'

export const catalog: Catalog = CATALOG
export const tracks: Track[] = CATALOG.tracks
export const totals = CATALOG.totals
export const blockSpecs = CATALOG.blocks
export const modeSpecs = CATALOG.modes
export const roadmaps: Roadmap[] = ROADMAPS.roadmaps ?? []

/** Every lesson stub, flattened in reading order. Built once. */
export const allLessons: LessonStub[] = tracks.flatMap((t) =>
  t.modules.flatMap((m) => m.lessons),
)

const lessonById = new Map(allLessons.map((l) => [l.id, l]))
const trackBySlug = new Map(tracks.map((t) => [t.slug, t]))

/** Lessons are addressed by `/learn/:track/:lesson` — slug is unique within a track. */
const lessonByRoute = new Map(allLessons.map((l) => [`${l.track}/${l.slug}`, l]))

export const getTrack = (slug: string): Track | undefined => trackBySlug.get(slug)
export const getLessonStub = (id: string): LessonStub | undefined => lessonById.get(id)

export function findLesson(trackSlug: string, lessonSlug: string): LessonStub | undefined {
  return lessonByRoute.get(`${trackSlug}/${lessonSlug}`)
}

export function getModule(trackSlug: string, moduleSlug: string): Module | undefined {
  return trackBySlug.get(trackSlug)?.modules.find((m) => m.slug === moduleSlug)
}

export function lessonsOfTrack(trackSlug: string): LessonStub[] {
  return trackBySlug.get(trackSlug)?.modules.flatMap((m) => m.lessons) ?? []
}

/* ------------------------------------------------------------- lazy bodies */

// Vite turns this into one chunk per lesson JSON, resolved at build time.
const lessonModules = import.meta.glob<{ default: Lesson }>('../generated/lessons/*.json')

const lessonCache = new Map<string, Lesson>()

export async function loadLesson(id: string): Promise<Lesson | null> {
  const cached = lessonCache.get(id)
  if (cached) return cached

  const key = `../generated/lessons/${id.replace(/\//g, '__')}.json`
  const importer = lessonModules[key]
  if (!importer) return null

  const mod = await importer()
  const lesson = mod.default
  lessonCache.set(id, lesson)
  return lesson
}

/** Prefetch without blocking — used to warm the "next lesson" link. */
export function prefetchLesson(id: string): void {
  if (lessonCache.has(id)) return
  void loadLesson(id).catch(() => {
    /* prefetch is best-effort; a failure here must never surface to the learner */
  })
}

let graphPromise: Promise<Graph> | null = null
export function loadGraph(): Promise<Graph> {
  graphPromise ??= import('../generated/graph.json').then((m) => m.default as unknown as Graph)
  return graphPromise
}

/* ------------------------------------------------------------------ digest */

/** Every interview question in the curriculum, with its lesson for context. */
export async function loadInterviewBank(): Promise<
  Array<{ lesson: LessonStub; question: import('./types').InterviewQuestion }>
> {
  const out: Array<{ lesson: LessonStub; question: import('./types').InterviewQuestion }> = []
  const withInterview = allLessons.filter((l) => l.interviewCount > 0)
  const loaded = await Promise.all(withInterview.map((l) => loadLesson(l.id)))
  loaded.forEach((lesson, i) => {
    const stub = withInterview[i]
    if (!lesson || !stub) return
    for (const question of lesson.interview) out.push({ lesson: stub, question })
  })
  return out
}

/** Every exercise in the curriculum. Used by /practice. */
export async function loadExerciseBank(): Promise<
  Array<{ lesson: LessonStub; exercise: import('./types').Exercise }>
> {
  const withExercise = allLessons.filter((l) => l.hasExercise)
  const loaded = await Promise.all(withExercise.map((l) => loadLesson(l.id)))
  const out: Array<{ lesson: LessonStub; exercise: import('./types').Exercise }> = []
  loaded.forEach((lesson, i) => {
    const stub = withExercise[i]
    if (lesson?.exercise && stub) out.push({ lesson: stub, exercise: lesson.exercise })
  })
  return out
}
