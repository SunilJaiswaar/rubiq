/**
 * Progress tracking.
 *
 * Design rule from the brief (§40, §61): track what tells a learner something true about
 * their understanding, and nothing that merely rewards clicking. So we record quiz
 * accuracy per *concept* (which is diagnostic) and we do not record, say, page views.
 *
 * "Complete" deliberately means more than "scrolled to the bottom". A lesson with a quiz
 * is not complete until the quiz is passed. Marking read is a separate, weaker signal.
 */
import { createStore, type Store } from '@/storage/store'
import type { LessonStub } from '@/content/types'

export interface LessonProgress {
  lessonId: string
  /** Opened and scrolled through. Weak signal. */
  read: boolean
  /** Quiz passed and/or exercise solved. Strong signal. */
  completed: boolean
  readAt: string | null
  completedAt: string | null
  /** Seconds of focused time, accumulated in 15s ticks while the tab is visible. */
  seconds: number
  quizAttempts: number
  bestQuizScore: number
  exerciseSolved: boolean
}

export interface ConceptStat {
  concept: string
  correct: number
  total: number
  lastSeen: string
}

export interface Streak {
  current: number
  longest: number
  lastActiveDay: string | null
  /** ISO days on which anything was completed. Kept for the activity heatmap. */
  days: string[]
}

export interface Note {
  lessonId: string
  body: string
  updatedAt: string
}

export interface Bookmark {
  lessonId: string
  title: string
  route: string
  createdAt: string
}

const K = {
  lesson: (id: string) => `progress:lesson:${id}`,
  concept: (c: string) => `stat:concept:${c}`,
  note: (id: string) => `note:${id}`,
  bookmark: (id: string) => `bookmark:${id}`,
  streak: 'meta:streak',
  profile: 'meta:profile',
} as const

const today = (): string => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string): number =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)

export const emptyLessonProgress = (lessonId: string): LessonProgress => ({
  lessonId,
  read: false,
  completed: false,
  readAt: null,
  completedAt: null,
  seconds: 0,
  quizAttempts: 0,
  bestQuizScore: 0,
  exerciseSolved: false,
})

export class ProgressEngine {
  #store: Store

  private constructor(store: Store) {
    this.#store = store
  }

  static async create(): Promise<ProgressEngine> {
    return new ProgressEngine(await createStore())
  }

  get durable(): boolean {
    return this.#store.durable
  }

  /* --------------------------------------------------------------- lessons */

  async lesson(lessonId: string): Promise<LessonProgress> {
    return (await this.#store.get<LessonProgress>(K.lesson(lessonId))) ?? emptyLessonProgress(lessonId)
  }

  async allLessonProgress(): Promise<Map<string, LessonProgress>> {
    const entries = await this.#store.entries<LessonProgress>('progress:lesson:')
    return new Map(entries.map(([, v]) => [v.lessonId, v]))
  }

  async #patchLesson(
    lessonId: string,
    patch: (p: LessonProgress) => LessonProgress,
  ): Promise<LessonProgress> {
    const next = patch(await this.lesson(lessonId))
    await this.#store.set(K.lesson(lessonId), next)
    return next
  }

  async markRead(lessonId: string): Promise<LessonProgress> {
    return this.#patchLesson(lessonId, (p) =>
      p.read ? p : { ...p, read: true, readAt: new Date().toISOString() },
    )
  }

  async addTime(lessonId: string, seconds: number): Promise<void> {
    if (seconds <= 0) return
    await this.#patchLesson(lessonId, (p) => ({ ...p, seconds: p.seconds + seconds }))
  }

  /**
   * Completion is earned, not declared. A lesson with a quiz needs a passing score;
   * a lesson with an exercise needs the exercise solved. A lesson with neither can be
   * completed by reading it, because there is nothing else to measure.
   */
  async recomputeCompletion(stub: LessonStub, passScore: number): Promise<LessonProgress> {
    return this.#patchLesson(stub.id, (p) => {
      const quizOk = !stub.hasQuiz || p.bestQuizScore >= passScore
      const exerciseOk = !stub.hasExercise || p.exerciseSolved
      const readOk = p.read
      const completed = readOk && quizOk && exerciseOk
      if (completed === p.completed) return p
      return {
        ...p,
        completed,
        completedAt: completed ? new Date().toISOString() : null,
      }
    })
  }

  async recordQuizResult(lessonId: string, score: number): Promise<LessonProgress> {
    return this.#patchLesson(lessonId, (p) => ({
      ...p,
      quizAttempts: p.quizAttempts + 1,
      bestQuizScore: Math.max(p.bestQuizScore, score),
    }))
  }

  async recordExerciseSolved(lessonId: string): Promise<LessonProgress> {
    return this.#patchLesson(lessonId, (p) => ({ ...p, exerciseSolved: true }))
  }

  /** Clear one lesson's progress — the learner is allowed to start over. */
  async resetLesson(lessonId: string): Promise<void> {
    await this.#store.delete(K.lesson(lessonId))
  }

  /* -------------------------------------------------------------- concepts */

  /** Per-concept accuracy is what makes "your weak areas" a real claim, not a guess. */
  async recordConcept(concept: string, correct: boolean): Promise<void> {
    const existing = (await this.#store.get<ConceptStat>(K.concept(concept))) ?? {
      concept, correct: 0, total: 0, lastSeen: '',
    }
    await this.#store.set(K.concept(concept), {
      concept,
      correct: existing.correct + (correct ? 1 : 0),
      total: existing.total + 1,
      lastSeen: new Date().toISOString(),
    })
  }

  async conceptStats(): Promise<ConceptStat[]> {
    const entries = await this.#store.entries<ConceptStat>('stat:concept:')
    return entries.map(([, v]) => v).sort((a, b) => a.concept.localeCompare(b.concept))
  }

  /**
   * Weak concepts, worst first. Requires at least `minAttempts` so that one unlucky
   * answer does not brand a concept as a weakness.
   */
  async weakConcepts(minAttempts = 2, threshold = 0.7): Promise<ConceptStat[]> {
    const stats = await this.conceptStats()
    return stats
      .filter((s) => s.total >= minAttempts && s.correct / s.total < threshold)
      .sort((a, b) => a.correct / a.total - b.correct / b.total)
  }

  /* ---------------------------------------------------------------- streak */

  async streak(): Promise<Streak> {
    return (
      (await this.#store.get<Streak>(K.streak)) ?? {
        current: 0, longest: 0, lastActiveDay: null, days: [],
      }
    )
  }

  /**
   * Called when the learner does something that counts: passing a quiz, solving an
   * exercise, completing a lesson. Not called for merely opening a page — a streak
   * you can keep by loading a tab measures nothing.
   */
  async touchStreak(): Promise<Streak> {
    const s = await this.streak()
    const day = today()
    if (s.lastActiveDay === day) return s

    const gap = s.lastActiveDay ? daysBetween(s.lastActiveDay, day) : Infinity
    const current = gap === 1 ? s.current + 1 : 1
    const next: Streak = {
      current,
      longest: Math.max(s.longest, current),
      lastActiveDay: day,
      days: [...new Set([...s.days, day])].sort().slice(-400),
    }
    await this.#store.set(K.streak, next)
    return next
  }

  /* -------------------------------------------------- notes and bookmarks */

  async note(lessonId: string): Promise<Note | null> {
    return this.#store.get<Note>(K.note(lessonId))
  }
  async saveNote(lessonId: string, body: string): Promise<void> {
    if (!body.trim()) {
      await this.#store.delete(K.note(lessonId))
      return
    }
    await this.#store.set(K.note(lessonId), {
      lessonId, body, updatedAt: new Date().toISOString(),
    })
  }
  async allNotes(): Promise<Note[]> {
    const entries = await this.#store.entries<Note>('note:')
    return entries.map(([, v]) => v).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  async isBookmarked(lessonId: string): Promise<boolean> {
    return (await this.#store.get(K.bookmark(lessonId))) !== null
  }
  async toggleBookmark(stub: LessonStub): Promise<boolean> {
    const key = K.bookmark(stub.id)
    if (await this.#store.get(key)) {
      await this.#store.delete(key)
      return false
    }
    await this.#store.set<Bookmark>(key, {
      lessonId: stub.id, title: stub.title, route: stub.route,
      createdAt: new Date().toISOString(),
    })
    return true
  }
  async allBookmarks(): Promise<Bookmark[]> {
    const entries = await this.#store.entries<Bookmark>('bookmark:')
    return entries.map(([, v]) => v).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /* --------------------------------------------------------------- profile */

  async profile<T>(): Promise<T | null> {
    return this.#store.get<T>(K.profile)
  }
  async saveProfile<T>(value: T): Promise<void> {
    await this.#store.set(K.profile, value)
  }

  /* -------------------------------------------------------- export/import */

  /** §60: the learner owns their data and can take it elsewhere. */
  async exportAll(): Promise<Record<string, unknown>> {
    const entries = await this.#store.entries<unknown>()
    return {
      format: 'rubiq-progress',
      version: 1,
      exportedAt: new Date().toISOString(),
      data: Object.fromEntries(entries),
    }
  }

  async importAll(payload: unknown, mode: 'merge' | 'replace' = 'merge'): Promise<number> {
    if (
      typeof payload !== 'object' || payload === null ||
      (payload as { format?: string }).format !== 'rubiq-progress'
    ) {
      throw new Error('Not a Rubiq progress file')
    }
    const data = (payload as { data?: Record<string, unknown> }).data
    if (!data || typeof data !== 'object') throw new Error('Progress file has no data')

    if (mode === 'replace') await this.#store.clear()

    let count = 0
    for (const [key, value] of Object.entries(data)) {
      // Never import keys we do not recognise — an imported file should not be able
      // to write arbitrary storage keys.
      if (!/^(progress:|stat:|note:|bookmark:|meta:|srs:)/.test(key)) continue
      await this.#store.set(key, value)
      count++
    }
    return count
  }

  async clearEverything(): Promise<void> {
    await this.#store.clear()
  }
}
