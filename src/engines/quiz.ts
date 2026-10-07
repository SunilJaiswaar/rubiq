/**
 * Quiz grading. Pure functions — no storage, no React — so the rules are testable.
 *
 * Note what is deliberately *not* here: automatic grading of free-text answers. The brief
 * asks for "explain this in your own words", then evaluate. We cannot honestly evaluate
 * prose without an LLM, and the core experience must not depend on a paid API (§43).
 * So a recall question reveals key points and a model answer and asks the learner to
 * self-assess. Self-explanation followed by comparison against a model is itself one of
 * the better-evidenced study techniques, so this is not merely a fallback.
 */
import type { Question, Quiz } from '@/content/types'

export type Answer =
  | { kind: 'choice'; optionIds: string[] }
  | { kind: 'recall'; text: string; selfGrade: 'got-it' | 'partly' | 'missed' | null }
  | { kind: 'order'; items: string[] }

export interface GradedAnswer {
  questionId: string
  concept: string | null
  correct: boolean
  /** Partial credit, 0..1. Multi-select and ordering questions are not all-or-nothing. */
  score: number
  /** Option ids the learner got wrong, for targeted feedback. */
  wrongOptionIds: string[]
  missedOptionIds: string[]
  answered: boolean
}

export interface QuizResult {
  answers: GradedAnswer[]
  score: number
  passed: boolean
  correctCount: number
  total: number
  weakConcepts: string[]
}

export function gradeAnswer(question: Question, answer: Answer | undefined): GradedAnswer {
  const base: GradedAnswer = {
    questionId: question.id,
    concept: question.concept,
    correct: false,
    score: 0,
    wrongOptionIds: [],
    missedOptionIds: [],
    answered: answer !== undefined,
  }

  if (!answer) return base

  if (question.kind === 'choice' || question.kind === 'multi') {
    if (answer.kind !== 'choice') return base
    const correctIds = question.options.filter((o) => o.correct).map((o) => o.id)
    const chosen = new Set(answer.optionIds)
    const wrong = answer.optionIds.filter((id) => !correctIds.includes(id))
    const missed = correctIds.filter((id) => !chosen.has(id))

    // Jaccard-style partial credit, floored at 0 so wild guessing earns nothing.
    const hits = correctIds.filter((id) => chosen.has(id)).length
    const score =
      question.kind === 'choice'
        ? wrong.length === 0 && missed.length === 0 ? 1 : 0
        : Math.max(0, (hits - wrong.length) / Math.max(1, correctIds.length))

    return {
      ...base,
      correct: wrong.length === 0 && missed.length === 0,
      score,
      wrongOptionIds: wrong,
      missedOptionIds: missed,
    }
  }

  if (question.kind === 'order') {
    if (answer.kind !== 'order') return base
    const expected = question.items
    // Credit for each item in its right place — reordering one step should not zero out.
    const hits = answer.items.filter((item, i) => expected[i] === item).length
    const score = expected.length === 0 ? 0 : hits / expected.length
    return { ...base, correct: hits === expected.length, score }
  }

  // recall — learner-assessed
  if (answer.kind !== 'recall') return base
  const score =
    answer.selfGrade === 'got-it' ? 1 : answer.selfGrade === 'partly' ? 0.5 : 0
  return {
    ...base,
    correct: answer.selfGrade === 'got-it',
    score,
    answered: answer.selfGrade !== null,
  }
}

export function gradeQuiz(quiz: Quiz, answers: Map<string, Answer>): QuizResult {
  const graded = quiz.questions.map((q) => gradeAnswer(q, answers.get(q.id)))
  const total = quiz.questions.length
  const score = total === 0 ? 0 : graded.reduce((n, g) => n + g.score, 0) / total

  // A concept counts as weak if the learner missed it here. Combined over sessions by
  // ProgressEngine.weakConcepts, which requires repeat evidence before it says so.
  const weakConcepts = [
    ...new Set(graded.filter((g) => !g.correct && g.concept).map((g) => g.concept as string)),
  ]

  return {
    answers: graded,
    score,
    passed: score >= quiz.passScore,
    correctCount: graded.filter((g) => g.correct).length,
    total,
    weakConcepts,
  }
}

/** Deterministic shuffle so a learner retrying a quiz does not get the same order. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items]
  let state = seed || 1
  for (let i = out.length - 1; i > 0; i--) {
    // xorshift32 — tiny, deterministic, good enough for option order.
    state ^= state << 13; state >>>= 0
    state ^= state >> 17
    state ^= state << 5; state >>>= 0
    const j = state % (i + 1)
    const a = out[i] as T
    const b = out[j] as T
    out[i] = b
    out[j] = a
  }
  return out
}
