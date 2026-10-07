/**
 * Spaced repetition (brief §11).
 *
 * A modified SM-2. Two deliberate departures from textbook SM-2:
 *
 * 1. **Items are concepts, not cards.** A learner does not need to review "the text of
 *    lesson 4"; they need to be re-asked about `closures` until they hold it. Scheduling
 *    by concept lets us pull a *different* question about the same idea each time, which
 *    is retrieval practice rather than answer memorisation.
 *
 * 2. **A lapse does not reset to zero.** Textbook SM-2 sends a forgotten item back to a
 *    1-day interval. For engineering concepts that is punishing and demotivating, so a
 *    lapse halves the interval with a floor instead.
 */
import { createStore, type Store } from '@/storage/store'

export type Grade = 'again' | 'hard' | 'good' | 'easy'

export interface ReviewItem {
  /** A concept slug, e.g. `closures`. */
  concept: string
  /** Lessons that teach this concept — where to send the learner to re-read. */
  lessonIds: string[]
  /** SM-2 ease factor. Higher = intervals grow faster. */
  ease: number
  /** Current interval in days. */
  interval: number
  /** Consecutive successful reviews. */
  streak: number
  lapses: number
  due: string
  lastReviewed: string | null
}

const MIN_EASE = 1.3
const MAX_EASE = 3.0
const K_ITEM = (concept: string) => `srs:${concept}`

const addDays = (from: Date, days: number): string => {
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() + Math.max(0, Math.round(days)))
  return d.toISOString().slice(0, 10)
}

export const newItem = (concept: string, lessonIds: string[] = []): ReviewItem => ({
  concept,
  lessonIds,
  ease: 2.5,
  interval: 0,
  streak: 0,
  lapses: 0,
  due: new Date().toISOString().slice(0, 10),
  lastReviewed: null,
})

/**
 * Pure scheduling function — the part worth testing exhaustively.
 * Exported separately from the engine so it can be tested with no storage at all.
 */
export function schedule(item: ReviewItem, grade: Grade, now = new Date()): ReviewItem {
  let { ease, interval, streak, lapses } = item

  switch (grade) {
    case 'again': {
      lapses += 1
      streak = 0
      ease = Math.max(MIN_EASE, ease - 0.2)
      // Halve rather than reset: a forgotten concept is not an unknown concept.
      interval = interval === 0 ? 1 : Math.max(1, Math.floor(interval / 2))
      break
    }
    case 'hard': {
      streak += 1
      ease = Math.max(MIN_EASE, ease - 0.15)
      interval = interval === 0 ? 1 : Math.max(1, Math.round(interval * 1.2))
      break
    }
    case 'good': {
      streak += 1
      ease = Math.min(MAX_EASE, ease + 0.0)
      interval = interval === 0 ? 1 : interval === 1 ? 3 : Math.round(interval * ease)
      break
    }
    case 'easy': {
      streak += 1
      ease = Math.min(MAX_EASE, ease + 0.15)
      interval = interval === 0 ? 2 : interval === 1 ? 5 : Math.round(interval * ease * 1.3)
      break
    }
  }

  // Cap at a year — beyond that the schedule is fiction.
  interval = Math.min(interval, 365)

  return {
    ...item,
    ease: Number(ease.toFixed(2)),
    interval,
    streak,
    lapses,
    due: addDays(now, interval),
    lastReviewed: now.toISOString(),
  }
}

export class SrsEngine {
  #store: Store

  private constructor(store: Store) {
    this.#store = store
  }

  static async create(): Promise<SrsEngine> {
    return new SrsEngine(await createStore())
  }

  async all(): Promise<ReviewItem[]> {
    const entries = await this.#store.entries<ReviewItem>('srs:')
    return entries.map(([, v]) => v)
  }

  /** Items due today or overdue, most overdue first. */
  async due(now = new Date()): Promise<ReviewItem[]> {
    const day = now.toISOString().slice(0, 10)
    return (await this.all())
      .filter((i) => i.due <= day)
      .sort((a, b) => a.due.localeCompare(b.due) || b.lapses - a.lapses)
  }

  /**
   * Put a concept into the review schedule. Called when a learner first meets a
   * concept in a lesson, so the review queue fills itself as they study.
   */
  async enrol(concept: string, lessonId: string): Promise<ReviewItem> {
    const existing = await this.#store.get<ReviewItem>(K_ITEM(concept))
    if (existing) {
      if (existing.lessonIds.includes(lessonId)) return existing
      const merged = { ...existing, lessonIds: [...existing.lessonIds, lessonId] }
      await this.#store.set(K_ITEM(concept), merged)
      return merged
    }
    const item = newItem(concept, [lessonId])
    await this.#store.set(K_ITEM(concept), item)
    return item
  }

  async review(concept: string, grade: Grade, now = new Date()): Promise<ReviewItem> {
    const item = (await this.#store.get<ReviewItem>(K_ITEM(concept))) ?? newItem(concept)
    const next = schedule(item, grade, now)
    await this.#store.set(K_ITEM(concept), next)
    return next
  }

  /** A forecast of the next fortnight, for the progress page. */
  async forecast(days = 14, now = new Date()): Promise<Array<{ day: string; count: number }>> {
    const items = await this.all()
    const out: Array<{ day: string; count: number }> = []
    for (let i = 0; i < days; i++) {
      const day = addDays(now, i)
      const count = items.filter((item) => (i === 0 ? item.due <= day : item.due === day)).length
      out.push({ day, count })
    }
    return out
  }

  /** Rough retention estimate: share of scheduled items not currently lapsing. */
  async health(): Promise<{ tracked: number; mature: number; struggling: number }> {
    const items = await this.all()
    return {
      tracked: items.length,
      mature: items.filter((i) => i.interval >= 21).length,
      struggling: items.filter((i) => i.lapses >= 2 && i.interval < 7).length,
    }
  }
}
