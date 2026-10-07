import { describe, it, expect } from 'vitest'
import { computeGaps, recommend, weeklyPlan, emptyProfile } from './roadmap'
import type { LessonProgress, ConceptStat } from './progress'
import type { Roadmap, Track, LessonStub } from '@/content/types'

const lesson = (id: string, concepts: string[] = [], minutes = 10): LessonStub => ({
  id, track: id.split('/')[0]!, module: 'm', slug: id.split('/').pop()!,
  title: id, summary: '', level: 'beginner', order: 1, minutes,
  tags: [], concepts, prerequisites: [], blocks: [], modes: ['full'],
  hasQuiz: false, hasExercise: false, hasPlayground: false, interviewCount: 0,
  sourcePath: id, route: `/learn/${id}`,
})

const track = (slug: string, lessons: LessonStub[], prerequisites: string[] = []): Track => ({
  slug, title: slug.toUpperCase(), tagline: '', description: '', category: 'c',
  icon: 'book', accent: 'indigo', difficulty: 'beginner', prerequisites,
  outcomes: [], order: 1, lessonCount: lessons.length,
  minutes: lessons.reduce((n, l) => n + l.minutes, 0),
  modules: [{ slug: 'm', title: 'M', summary: '', level: 'beginner', order: 1, lessons }],
})

const progress = (ids: string[]): Map<string, LessonProgress> =>
  new Map(ids.map((id) => [id, {
    lessonId: id, read: true, completed: true, readAt: null, completedAt: null,
    seconds: 0, quizAttempts: 1, bestQuizScore: 1, exerciseSolved: true,
  }]))

const stat = (concept: string, correct: number, total: number): ConceptStat =>
  ({ concept, correct, total, lastSeen: '2026-01-01' })

describe('computeGaps', () => {
  const ruby = track('ruby', [lesson('ruby/m/a', ['blocks']), lesson('ruby/m/b', ['procs'])])

  it('reports zero mastery with no evidence and no self-report', () => {
    const [gap] = computeGaps([ruby], new Map(), [], null)
    expect(gap?.mastery).toBe(0)
    expect(gap?.estimated).toBe(true)
  })

  it('falls back to self-report, and flags it as an estimate', () => {
    const profile = { ...emptyProfile(), selfReport: { ruby: 0.5 } }
    const [gap] = computeGaps([ruby], new Map(), [], profile)
    expect(gap?.mastery).toBe(0.5)
    expect(gap?.estimated).toBe(true)
  })

  it('replaces self-report with evidence the moment any exists', () => {
    const profile = { ...emptyProfile(), selfReport: { ruby: 0.9 } }
    const [gap] = computeGaps([ruby], progress(['ruby/m/a']), [], profile)
    expect(gap?.estimated).toBe(false)
    // Half the lessons done, no quiz data: 0.6*0.5 + 0.4*0.5
    expect(gap?.mastery).toBeCloseTo(0.5)
  })

  it('blends completion and quiz accuracy', () => {
    const [gap] = computeGaps([ruby], progress(['ruby/m/a', 'ruby/m/b']), [stat('blocks', 5, 10)], null)
    // completion 1.0 × 0.6 + accuracy 0.5 × 0.4
    expect(gap?.mastery).toBeCloseTo(0.8)
    expect(gap?.accuracy).toBeCloseTo(0.5)
  })

  it('leaves accuracy null when the learner has never been quizzed', () => {
    const [gap] = computeGaps([ruby], progress(['ruby/m/a']), [], null)
    expect(gap?.accuracy).toBeNull()
  })

  it('detects an unmet prerequisite and names it', () => {
    const rails = track('rails', [lesson('rails/m/a')], ['ruby'])
    const gaps = computeGaps([ruby, rails], new Map(), [], null)
    const railsGap = gaps.find((g) => g.track === 'rails')
    expect(railsGap?.prerequisitesMet).toBe(false)
    expect(railsGap?.missingPrerequisites).toEqual(['ruby'])
  })

  it('treats a prerequisite as met at 80% completion', () => {
    const rails = track('rails', [lesson('rails/m/a')], ['ruby'])
    const gaps = computeGaps([ruby, rails], progress(['ruby/m/a', 'ruby/m/b']), [], null)
    expect(gaps.find((g) => g.track === 'rails')?.prerequisitesMet).toBe(true)
  })

  it('clamps mastery into 0..1 even with odd inputs', () => {
    const profile = { ...emptyProfile(), selfReport: { ruby: 5 } }
    const [gap] = computeGaps([ruby], new Map(), [], profile)
    expect(gap?.mastery).toBe(1)
  })

  it('handles an empty track without dividing by zero', () => {
    const [gap] = computeGaps([track('empty', [])], new Map(), [], null)
    expect(Number.isNaN(gap?.mastery ?? NaN)).toBe(false)
  })
})

describe('recommend', () => {
  const ruby = track('ruby', [lesson('ruby/m/a'), lesson('ruby/m/b')])
  const rails = track('rails', [lesson('rails/m/a')], ['ruby'])
  const dsa = track('dsa', [lesson('dsa/m/a')])
  const tracks = [ruby, rails, dsa]

  const roadmap: Roadmap = {
    id: 'backend', title: 'Backend', role: 'Backend', summary: '', experience: 'junior',
    stages: [
      { title: 'Foundations', goal: '', tracks: ['ruby'] },
      { title: 'Framework', goal: '', tracks: ['rails'] },
    ],
  }

  it('puts an unblocked roadmap track ahead of an off-path one', () => {
    const gaps = computeGaps(tracks, new Map(), [], null)
    const recs = recommend(gaps, tracks, roadmap)
    expect(recs[0]?.track).toBe('ruby')
  })

  it('marks a track with unmet prerequisites as blocked and names what to do first', () => {
    const gaps = computeGaps(tracks, new Map(), [], null)
    const rec = recommend(gaps, tracks, roadmap, 10).find((r) => r.track === 'rails')
    expect(rec?.blocked).toBe(true)
    expect(rec?.reason).toContain('RUBY')
  })

  it('prefers finishing in-progress work over starting something new', () => {
    const gaps = computeGaps(tracks, progress(['ruby/m/a']), [], null)
    const recs = recommend(gaps, tracks, null)
    expect(recs[0]?.track).toBe('ruby')
    expect(recs[0]?.reason).toContain('50%')
  })

  it('drops a track the learner has essentially finished', () => {
    const gaps = computeGaps(tracks, progress(['ruby/m/a', 'ruby/m/b']), [stat('x', 10, 10)], null)
    const recs = recommend(gaps, tracks, roadmap, 10)
    expect(recs.map((r) => r.track)).not.toContain('ruby')
  })

  it('calls out poor quiz accuracy as the reason to revisit', () => {
    const rubyWithConcepts = track('ruby', [lesson('ruby/m/a', ['blocks']), lesson('ruby/m/b', ['blocks'])])
    const gaps = computeGaps([rubyWithConcepts], progress(['ruby/m/a']), [stat('blocks', 2, 10)], null)
    const recs = recommend(gaps, [rubyWithConcepts], null)
    expect(recs[0]?.reason).toMatch(/accuracy|through/)
  })

  it('works with no roadmap selected', () => {
    const gaps = computeGaps(tracks, new Map(), [], null)
    expect(recommend(gaps, tracks, null).length).toBeGreaterThan(0)
  })
})

describe('weeklyPlan', () => {
  const ruby = track('ruby', [
    lesson('ruby/m/a', [], 30), lesson('ruby/m/b', [], 30), lesson('ruby/m/c', [], 30),
  ])

  it('fits the plan inside the time budget, with headroom', () => {
    const gaps = computeGaps([ruby], new Map(), [], null)
    const recs = recommend(gaps, [ruby], null)
    // 30 min/day × 7 × 0.8 = 168 minutes of budget
    const plan = weeklyPlan([ruby], recs, new Map(), 30)
    expect(plan.reduce((n, p) => n + p.minutes, 0)).toBeLessThanOrEqual(168)
    expect(plan).toHaveLength(3)
  })

  it('stops short rather than overfilling a small budget', () => {
    const gaps = computeGaps([ruby], new Map(), [], null)
    const recs = recommend(gaps, [ruby], null)
    const plan = weeklyPlan([ruby], recs, new Map(), 5) // 28 minutes
    expect(plan).toHaveLength(0)
  })

  it('skips lessons already completed', () => {
    const gaps = computeGaps([ruby], progress(['ruby/m/a']), [], null)
    const recs = recommend(gaps, [ruby], null)
    const plan = weeklyPlan([ruby], recs, progress(['ruby/m/a']), 30)
    expect(plan.map((p) => p.lessonId)).not.toContain('ruby/m/a')
  })

  it('never plans a blocked track', () => {
    const rails = track('rails', [lesson('rails/m/a', [], 10)], ['ruby'])
    const gaps = computeGaps([ruby, rails], new Map(), [], null)
    const recs = recommend(gaps, [ruby, rails], null, 10)
    const plan = weeklyPlan([ruby, rails], recs, new Map(), 60)
    expect(plan.map((p) => p.track)).not.toContain('RAILS')
  })
})
