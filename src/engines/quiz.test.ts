import { describe, it, expect } from 'vitest'
import { gradeAnswer, gradeQuiz, shuffle, type Answer } from './quiz'
import type { ChoiceQuestion, OrderQuestion, Quiz, RecallQuestion } from '@/content/types'

const choice = (correctIds: string[], kind: 'choice' | 'multi' = 'choice'): ChoiceQuestion => ({
  id: 'q1', kind, prompt: 'p', explanation: 'e', concept: 'blocks',
  options: ['a', 'b', 'c', 'd'].map((id) => ({
    id, text: id.toUpperCase(), correct: correctIds.includes(id), feedback: '',
  })),
})

describe('gradeAnswer — single choice', () => {
  const q = choice(['b'])

  it('is correct only for the right option', () => {
    expect(gradeAnswer(q, { kind: 'choice', optionIds: ['b'] }).correct).toBe(true)
    expect(gradeAnswer(q, { kind: 'choice', optionIds: ['a'] }).correct).toBe(false)
  })

  it('reports which option was wrong and which was missed', () => {
    const g = gradeAnswer(q, { kind: 'choice', optionIds: ['a'] })
    expect(g.wrongOptionIds).toEqual(['a'])
    expect(g.missedOptionIds).toEqual(['b'])
  })

  it('gives no partial credit — single choice is all or nothing', () => {
    expect(gradeAnswer(q, { kind: 'choice', optionIds: ['a'] }).score).toBe(0)
    expect(gradeAnswer(q, { kind: 'choice', optionIds: ['b'] }).score).toBe(1)
  })

  it('marks an unanswered question as unanswered, not wrong-with-zero', () => {
    const g = gradeAnswer(q, undefined)
    expect(g.answered).toBe(false)
    expect(g.score).toBe(0)
  })
})

describe('gradeAnswer — multi select', () => {
  const q = choice(['a', 'c'], 'multi')

  it('awards full credit for exactly the right set', () => {
    const g = gradeAnswer(q, { kind: 'choice', optionIds: ['a', 'c'] })
    expect(g.correct).toBe(true)
    expect(g.score).toBe(1)
  })

  it('awards partial credit for a subset', () => {
    expect(gradeAnswer(q, { kind: 'choice', optionIds: ['a'] }).score).toBe(0.5)
  })

  it('penalises a wrong pick, so selecting everything earns nothing', () => {
    const g = gradeAnswer(q, { kind: 'choice', optionIds: ['a', 'b', 'c', 'd'] })
    expect(g.score).toBe(0)
    expect(g.correct).toBe(false)
  })

  it('never returns a negative score', () => {
    expect(gradeAnswer(q, { kind: 'choice', optionIds: ['b', 'd'] }).score).toBe(0)
  })
})

describe('gradeAnswer — ordering', () => {
  const q: OrderQuestion = {
    id: 'q1', kind: 'order', prompt: 'p', explanation: 'e', concept: 'http',
    items: ['DNS', 'TCP', 'TLS', 'HTTP'],
  }

  it('is correct for the exact order', () => {
    const g = gradeAnswer(q, { kind: 'order', items: ['DNS', 'TCP', 'TLS', 'HTTP'] })
    expect(g.correct).toBe(true)
    expect(g.score).toBe(1)
  })

  it('gives credit per correctly placed item', () => {
    const g = gradeAnswer(q, { kind: 'order', items: ['DNS', 'TCP', 'HTTP', 'TLS'] })
    expect(g.score).toBe(0.5)
    expect(g.correct).toBe(false)
  })
})

describe('gradeAnswer — recall', () => {
  const q: RecallQuestion = {
    id: 'q1', kind: 'recall', prompt: 'Explain closures', explanation: 'e',
    concept: 'closures', keyPoints: ['captures scope'], model: 'A closure is…',
  }

  it('is unanswered until the learner self-assesses', () => {
    const g = gradeAnswer(q, { kind: 'recall', text: 'something', selfGrade: null })
    expect(g.answered).toBe(false)
  })

  it('maps the three self-grades to full, half and no credit', () => {
    const grade = (selfGrade: 'got-it' | 'partly' | 'missed') =>
      gradeAnswer(q, { kind: 'recall', text: 't', selfGrade }).score
    expect(grade('got-it')).toBe(1)
    expect(grade('partly')).toBe(0.5)
    expect(grade('missed')).toBe(0)
  })
})

describe('gradeAnswer — mismatched answer kind', () => {
  it('does not credit a choice answer submitted for an order question', () => {
    const q: OrderQuestion = {
      id: 'q1', kind: 'order', prompt: 'p', explanation: 'e', concept: null, items: ['a', 'b'],
    }
    const g = gradeAnswer(q, { kind: 'choice', optionIds: ['a'] })
    expect(g.score).toBe(0)
    expect(g.correct).toBe(false)
  })
})

describe('gradeQuiz', () => {
  const quiz: Quiz = {
    passScore: 0.7,
    questions: [
      { ...choice(['b']), id: 'q1', concept: 'blocks' },
      { ...choice(['a']), id: 'q2', concept: 'procs' },
      { ...choice(['c']), id: 'q3', concept: 'lambdas' },
    ],
  }

  it('passes at or above the pass score', () => {
    const answers = new Map<string, Answer>([
      ['q1', { kind: 'choice', optionIds: ['b'] }],
      ['q2', { kind: 'choice', optionIds: ['a'] }],
      ['q3', { kind: 'choice', optionIds: ['c'] }],
    ])
    const result = gradeQuiz(quiz, answers)
    expect(result.score).toBe(1)
    expect(result.passed).toBe(true)
    expect(result.weakConcepts).toEqual([])
  })

  it('fails below the pass score and names the missed concepts', () => {
    const answers = new Map<string, Answer>([
      ['q1', { kind: 'choice', optionIds: ['b'] }],
      ['q2', { kind: 'choice', optionIds: ['d'] }],
      ['q3', { kind: 'choice', optionIds: ['d'] }],
    ])
    const result = gradeQuiz(quiz, answers)
    expect(result.passed).toBe(false)
    expect(result.correctCount).toBe(1)
    expect(result.weakConcepts.sort()).toEqual(['lambdas', 'procs'])
  })

  it('counts skipped questions against the score', () => {
    const answers = new Map<string, Answer>([['q1', { kind: 'choice', optionIds: ['b'] }]])
    const result = gradeQuiz(quiz, answers)
    expect(result.score).toBeCloseTo(1 / 3)
  })

  it('handles an empty quiz without dividing by zero', () => {
    const result = gradeQuiz({ passScore: 0.7, questions: [] }, new Map())
    expect(result.score).toBe(0)
    expect(Number.isNaN(result.score)).toBe(false)
  })
})

describe('shuffle', () => {
  it('is deterministic for a given seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffle(items, 42)).toEqual(shuffle(items, 42))
  })

  it('produces a different order for a different seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    expect(shuffle(items, 1)).not.toEqual(shuffle(items, 999))
  })

  it('keeps every element exactly once', () => {
    const items = ['a', 'b', 'c', 'd', 'e']
    expect([...shuffle(items, 7)].sort()).toEqual([...items].sort())
  })

  it('does not mutate the input', () => {
    const items = [1, 2, 3]
    shuffle(items, 5)
    expect(items).toEqual([1, 2, 3])
  })

  it('handles empty and single-element arrays', () => {
    expect(shuffle([], 1)).toEqual([])
    expect(shuffle([9], 1)).toEqual([9])
  })
})
