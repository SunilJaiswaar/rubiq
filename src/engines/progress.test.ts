import { describe, it, expect, beforeEach } from 'vitest'
import { ProgressEngine } from './progress'
import { __setStoreForTests, MemoryStore, LocalStorageStore } from '@/storage/store'
import type { LessonStub } from '@/content/types'

const stub = (over: Partial<LessonStub> = {}): LessonStub => ({
  id: 'ruby/core/blocks', track: 'ruby', module: 'core', slug: 'blocks',
  title: 'Blocks', summary: '', level: 'beginner', order: 1, minutes: 10,
  tags: [], concepts: ['blocks'], prerequisites: [], blocks: [], modes: ['full'],
  hasQuiz: false, hasExercise: false, hasPlayground: false, interviewCount: 0,
  sourcePath: '10-ruby/10-core/10-blocks', route: '/learn/ruby/blocks',
  ...over,
})

let engine: ProgressEngine
beforeEach(async () => {
  __setStoreForTests(new MemoryStore())
  engine = await ProgressEngine.create()
})

describe('completion is earned, not declared', () => {
  it('completes a lesson with nothing to assess once it is read', async () => {
    await engine.markRead('ruby/core/blocks')
    const p = await engine.recomputeCompletion(stub(), 0.7)
    expect(p.completed).toBe(true)
  })

  it('does not complete a quiz lesson that has only been read', async () => {
    const s = stub({ hasQuiz: true })
    await engine.markRead(s.id)
    expect((await engine.recomputeCompletion(s, 0.7)).completed).toBe(false)
  })

  it('completes a quiz lesson once the quiz is passed', async () => {
    const s = stub({ hasQuiz: true })
    await engine.markRead(s.id)
    await engine.recordQuizResult(s.id, 0.8)
    expect((await engine.recomputeCompletion(s, 0.7)).completed).toBe(true)
  })

  it('does not complete on a failing quiz score', async () => {
    const s = stub({ hasQuiz: true })
    await engine.markRead(s.id)
    await engine.recordQuizResult(s.id, 0.5)
    expect((await engine.recomputeCompletion(s, 0.7)).completed).toBe(false)
  })

  it('requires the exercise too when a lesson has one', async () => {
    const s = stub({ hasQuiz: true, hasExercise: true })
    await engine.markRead(s.id)
    await engine.recordQuizResult(s.id, 1)
    expect((await engine.recomputeCompletion(s, 0.7)).completed).toBe(false)
    await engine.recordExerciseSolved(s.id)
    expect((await engine.recomputeCompletion(s, 0.7)).completed).toBe(true)
  })

  it('keeps the best quiz score across attempts, not the latest', async () => {
    await engine.recordQuizResult('ruby/core/blocks', 0.9)
    const p = await engine.recordQuizResult('ruby/core/blocks', 0.3)
    expect(p.bestQuizScore).toBe(0.9)
    expect(p.quizAttempts).toBe(2)
  })

  it('stamps completedAt only when completion actually flips', async () => {
    const s = stub()
    await engine.markRead(s.id)
    const first = await engine.recomputeCompletion(s, 0.7)
    const second = await engine.recomputeCompletion(s, 0.7)
    expect(second.completedAt).toBe(first.completedAt)
  })
})

describe('weak concepts need repeat evidence', () => {
  it('ignores a concept seen only once', async () => {
    await engine.recordConcept('closures', false)
    expect(await engine.weakConcepts()).toEqual([])
  })

  it('reports a concept missed repeatedly', async () => {
    await engine.recordConcept('closures', false)
    await engine.recordConcept('closures', false)
    const weak = await engine.weakConcepts()
    expect(weak.map((w) => w.concept)).toEqual(['closures'])
  })

  it('does not report a concept the learner mostly gets right', async () => {
    for (let i = 0; i < 9; i++) await engine.recordConcept('blocks', true)
    await engine.recordConcept('blocks', false)
    expect(await engine.weakConcepts()).toEqual([])
  })

  it('orders weak concepts worst-first', async () => {
    for (let i = 0; i < 4; i++) await engine.recordConcept('bad', false)
    await engine.recordConcept('mid', true)
    await engine.recordConcept('mid', false)
    await engine.recordConcept('mid', false)
    const weak = await engine.weakConcepts()
    expect(weak.map((w) => w.concept)).toEqual(['bad', 'mid'])
  })
})

describe('streak', () => {
  it('starts at one on the first qualifying day', async () => {
    expect((await engine.touchStreak()).current).toBe(1)
  })

  it('does not advance twice in the same day', async () => {
    await engine.touchStreak()
    expect((await engine.touchStreak()).current).toBe(1)
  })

  it('continues on a consecutive day', async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    const store = new MemoryStore()
    __setStoreForTests(store)
    await store.set('meta:streak', { current: 4, longest: 9, lastActiveDay: yesterday, days: [yesterday] })
    const e = await ProgressEngine.create()
    expect((await e.touchStreak()).current).toBe(5)
  })

  it('resets after a missed day but remembers the longest', async () => {
    const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
    const store = new MemoryStore()
    __setStoreForTests(store)
    await store.set('meta:streak', { current: 6, longest: 6, lastActiveDay: weekAgo, days: [] })
    const e = await ProgressEngine.create()
    const s = await e.touchStreak()
    expect(s.current).toBe(1)
    expect(s.longest).toBe(6)
  })
})

describe('notes and bookmarks', () => {
  it('round-trips a note', async () => {
    await engine.saveNote('ruby/core/blocks', 'yield is a hole in the method')
    expect((await engine.note('ruby/core/blocks'))?.body).toBe('yield is a hole in the method')
  })

  it('deletes a note when emptied, rather than storing blanks', async () => {
    await engine.saveNote('ruby/core/blocks', 'x')
    await engine.saveNote('ruby/core/blocks', '   ')
    expect(await engine.note('ruby/core/blocks')).toBeNull()
  })

  it('toggles a bookmark both ways', async () => {
    expect(await engine.toggleBookmark(stub())).toBe(true)
    expect(await engine.isBookmarked('ruby/core/blocks')).toBe(true)
    expect(await engine.toggleBookmark(stub())).toBe(false)
    expect(await engine.isBookmarked('ruby/core/blocks')).toBe(false)
  })
})

describe('export and import — no lock-in', () => {
  it('round-trips the whole store', async () => {
    await engine.markRead('ruby/core/blocks')
    await engine.recordConcept('blocks', true)
    await engine.saveNote('ruby/core/blocks', 'note')
    await engine.touchStreak()

    const dump = await engine.exportAll()

    __setStoreForTests(new MemoryStore())
    const fresh = await ProgressEngine.create()
    const count = await fresh.importAll(dump)

    expect(count).toBeGreaterThan(0)
    expect((await fresh.lesson('ruby/core/blocks')).read).toBe(true)
    expect((await fresh.note('ruby/core/blocks'))?.body).toBe('note')
    expect((await fresh.streak()).current).toBe(1)
  })

  it('rejects a file that is not a Rubiq export', async () => {
    await expect(engine.importAll({ foo: 1 })).rejects.toThrow('Not a Rubiq progress file')
  })

  it('rejects an export with no data block', async () => {
    await expect(engine.importAll({ format: 'rubiq-progress', version: 1 }))
      .rejects.toThrow('no data')
  })

  it('refuses to write storage keys it does not recognise', async () => {
    const count = await engine.importAll({
      format: 'rubiq-progress',
      version: 1,
      data: { 'evil:key': 'x', 'progress:lesson:a': { lessonId: 'a', read: true } },
    })
    expect(count).toBe(1)
  })

  it('merges by default and replaces on request', async () => {
    await engine.markRead('keep/me/please')
    const dump = { format: 'rubiq-progress', version: 1, data: { 'progress:lesson:x': { lessonId: 'x', read: true } } }

    await engine.importAll(dump, 'merge')
    expect((await engine.lesson('keep/me/please')).read).toBe(true)

    await engine.importAll(dump, 'replace')
    expect((await engine.lesson('keep/me/please')).read).toBe(false)
  })
})

describe('storage degradation', () => {
  it('reports memory storage as not durable, so the UI can warn', async () => {
    __setStoreForTests(new MemoryStore())
    const e = await ProgressEngine.create()
    expect(e.durable).toBe(false)
  })

  it('reports localStorage as durable', async () => {
    __setStoreForTests(new LocalStorageStore())
    const e = await ProgressEngine.create()
    expect(e.durable).toBe(true)
  })
})
