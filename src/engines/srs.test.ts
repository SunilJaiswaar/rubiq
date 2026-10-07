import { describe, it, expect } from 'vitest'
import { schedule, newItem, SrsEngine, type ReviewItem } from './srs'
import { __setStoreForTests, MemoryStore } from '@/storage/store'

const AT = new Date('2026-03-01T10:00:00.000Z')

describe('schedule', () => {
  it('gives a brand-new item a short first interval', () => {
    const next = schedule(newItem('closures'), 'good', AT)
    expect(next.interval).toBe(1)
    expect(next.due).toBe('2026-03-02')
    expect(next.streak).toBe(1)
  })

  it('grows 1 → 3 → ease-multiplied on repeated success', () => {
    let item = newItem('closures')
    item = schedule(item, 'good', AT)
    expect(item.interval).toBe(1)
    item = schedule(item, 'good', AT)
    expect(item.interval).toBe(3)
    item = schedule(item, 'good', AT)
    expect(item.interval).toBe(Math.round(3 * 2.5))
  })

  it('halves rather than resets on a lapse, so a slip is not a wipeout', () => {
    let item: ReviewItem = { ...newItem('gc'), interval: 20, ease: 2.5, streak: 4 }
    item = schedule(item, 'again', AT)
    expect(item.interval).toBe(10)
    expect(item.streak).toBe(0)
    expect(item.lapses).toBe(1)
    expect(item.ease).toBe(2.3)
  })

  it('never lets ease fall below the floor however many lapses', () => {
    let item = newItem('hard-thing')
    for (let i = 0; i < 20; i++) item = schedule(item, 'again', AT)
    expect(item.ease).toBe(1.3)
    expect(item.interval).toBeGreaterThanOrEqual(1)
  })

  it('never lets ease exceed the ceiling however many easy grades', () => {
    let item = newItem('easy-thing')
    for (let i = 0; i < 20; i++) item = schedule(item, 'easy', AT)
    expect(item.ease).toBeLessThanOrEqual(3)
  })

  it('caps the interval at a year — beyond that the schedule is fiction', () => {
    let item: ReviewItem = { ...newItem('x'), interval: 300, ease: 3 }
    item = schedule(item, 'easy', AT)
    expect(item.interval).toBe(365)
  })

  it('grows more slowly for "hard" than for "good"', () => {
    const base: ReviewItem = { ...newItem('x'), interval: 10 }
    expect(schedule(base, 'hard', AT).interval).toBeLessThan(schedule(base, 'good', AT).interval)
  })

  it('grows faster for "easy" than for "good"', () => {
    const base: ReviewItem = { ...newItem('x'), interval: 10 }
    expect(schedule(base, 'easy', AT).interval).toBeGreaterThan(schedule(base, 'good', AT).interval)
  })
})

describe('SrsEngine', () => {
  it('returns only items due today or earlier, most overdue first', async () => {
    const store = new MemoryStore()
    __setStoreForTests(store)
    await store.set('srs:a', { ...newItem('a'), due: '2026-02-20' })
    await store.set('srs:b', { ...newItem('b'), due: '2026-03-01' })
    await store.set('srs:c', { ...newItem('c'), due: '2026-12-01' })

    const engine = await SrsEngine.create()
    const due = await engine.due(AT)
    expect(due.map((i) => i.concept)).toEqual(['a', 'b'])
  })

  it('merges lesson ids when a concept is taught in more than one lesson', async () => {
    __setStoreForTests(new MemoryStore())
    const engine = await SrsEngine.create()
    await engine.enrol('blocks', 'ruby/core/blocks')
    const item = await engine.enrol('blocks', 'ruby/core/procs')
    expect(item.lessonIds).toEqual(['ruby/core/blocks', 'ruby/core/procs'])
  })

  it('does not duplicate a lesson id on re-enrolment', async () => {
    __setStoreForTests(new MemoryStore())
    const engine = await SrsEngine.create()
    await engine.enrol('blocks', 'ruby/core/blocks')
    const item = await engine.enrol('blocks', 'ruby/core/blocks')
    expect(item.lessonIds).toHaveLength(1)
  })

  it('counts overdue items into today in the forecast', async () => {
    const store = new MemoryStore()
    __setStoreForTests(store)
    await store.set('srs:a', { ...newItem('a'), due: '2026-01-01' })
    await store.set('srs:b', { ...newItem('b'), due: '2026-03-03' })

    const engine = await SrsEngine.create()
    const forecast = await engine.forecast(5, AT)
    expect(forecast[0]).toEqual({ day: '2026-03-01', count: 1 })
    expect(forecast[2]).toEqual({ day: '2026-03-03', count: 1 })
  })
})
