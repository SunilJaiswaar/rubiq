/**
 * The quiz runner.
 *
 * Two deliberate choices, both from §35 of the brief ("never immediately reveal the
 * answer"):
 *
 *  1. **Feedback is per question, after the learner commits to that question** — not at
 *     the end of the quiz, and not before answering. Immediate feedback after a committed
 *     answer is the condition under which testing improves retention; feedback before
 *     commitment just turns the quiz into reading.
 *
 *  2. **Recall questions are self-assessed.** The learner writes their answer, *then*
 *     reveals the key points and model answer and grades themselves. We cannot honestly
 *     mark prose without an LLM, and the core path must not depend on a paid API. Writing
 *     an explanation and then comparing it against a model is itself a well-evidenced
 *     technique, so this is not merely a fallback.
 */
import { useCallback, useMemo, useState } from 'react'
import type { Question, Quiz as QuizData } from '@/content/types'
import { gradeAnswer, gradeQuiz, shuffle, type Answer } from '@/engines/quiz'
import { Button, Card, cx, ProgressBar } from '@/ui/primitives'

export function Quiz({
  quiz, lessonId, onComplete,
}: {
  quiz: QuizData
  lessonId: string
  onComplete: (result: { score: number; passed: boolean; weakConcepts: string[]; perConcept: Array<{ concept: string; correct: boolean }> }) => void
}) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Map<string, Answer>>(new Map())
  const [committed, setCommitted] = useState<Set<string>>(new Set())
  const [finished, setFinished] = useState(false)
  // Re-attempting reshuffles options, so a retry is retrieval rather than recognition.
  const [attempt, setAttempt] = useState(0)

  const question = quiz.questions[index]
  const total = quiz.questions.length

  const setAnswer = useCallback((id: string, answer: Answer) => {
    setAnswers((prev) => new Map(prev).set(id, answer))
  }, [])

  const commit = useCallback(() => {
    if (!question) return
    setCommitted((prev) => new Set(prev).add(question.id))
  }, [question])

  const finish = useCallback(() => {
    const result = gradeQuiz(quiz, answers)
    setFinished(true)
    onComplete({
      score: result.score,
      passed: result.passed,
      weakConcepts: result.weakConcepts,
      perConcept: result.answers
        .filter((a) => a.concept)
        .map((a) => ({ concept: a.concept as string, correct: a.correct })),
    })
  }, [quiz, answers, onComplete])

  const restart = useCallback(() => {
    setAnswers(new Map())
    setCommitted(new Set())
    setIndex(0)
    setFinished(false)
    setAttempt((a) => a + 1)
  }, [])

  if (finished) {
    return (
      <QuizResults
        quiz={quiz}
        answers={answers}
        onRestart={restart}
      />
    )
  }

  if (!question) return null

  const isCommitted = committed.has(question.id)
  const answer = answers.get(question.id)
  const graded = isCommitted ? gradeAnswer(question, answer) : null
  const canCommit = hasAnswered(question, answer)
  const isLast = index === total - 1

  return (
    <Card className="overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-border">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs font-medium text-ink-muted">
            Question {index + 1} of {total}
          </span>
          <span className="text-xs text-ink-faint">
            {committed.size} answered
          </span>
        </div>
        <ProgressBar value={committed.size / total} showValue={false} />
      </div>

      <div className="p-5">
        <QuestionView
          key={`${question.id}-${attempt}`}
          question={question}
          answer={answer}
          committed={isCommitted}
          attempt={attempt}
          lessonId={lessonId}
          onChange={(a) => setAnswer(question.id, a)}
        />

        {graded && <Feedback question={question} graded={graded} />}
      </div>

      <div className="px-5 py-3.5 border-t border-border bg-surface flex items-center justify-between gap-3">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
          disabled={index === 0}
        >
          ← Previous
        </Button>

        <div className="flex gap-2">
          {!isCommitted ? (
            <Button
              size="sm"
              variant="primary"
              onClick={commit}
              disabled={!canCommit}
              title={canCommit ? undefined : 'Choose an answer first'}
            >
              {question.kind === 'recall' ? 'Reveal the model answer' : 'Check answer'}
            </Button>
          ) : isLast ? (
            <Button size="sm" variant="primary" onClick={finish}>
              See results
            </Button>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setIndex((i) => i + 1)}>
              Next →
            </Button>
          )}
        </div>
      </div>
    </Card>
  )
}

function hasAnswered(_question: Question, answer: Answer | undefined): boolean {
  if (!answer) return false
  if (answer.kind === 'choice') return answer.optionIds.length > 0
  if (answer.kind === 'recall') return answer.text.trim().length > 0
  if (answer.kind === 'order') return answer.items.length > 0
  return false
}

/* ------------------------------------------------------------- question UI */

function QuestionView({
  question, answer, committed, attempt, onChange,
}: {
  question: Question
  answer: Answer | undefined
  committed: boolean
  attempt: number
  lessonId: string
  onChange: (answer: Answer) => void
}) {
  return (
    <>
      <div className="prose !max-w-none text-[0.9375rem] mb-4">
        <QuestionPrompt text={question.prompt} />
      </div>

      {(question.kind === 'choice' || question.kind === 'multi') && (
        <ChoiceInput
          question={question}
          answer={answer}
          committed={committed}
          attempt={attempt}
          onChange={onChange}
        />
      )}

      {question.kind === 'order' && (
        <OrderInput question={question} answer={answer} committed={committed} attempt={attempt} onChange={onChange} />
      )}

      {question.kind === 'recall' && (
        <RecallInput question={question} answer={answer} committed={committed} onChange={onChange} />
      )}
    </>
  )
}

/**
 * Quiz prompts are plain text, except for fenced code and inline backticks, which the
 * content needs often enough to be worth handling. Nothing else is interpreted, so a
 * prompt cannot inject markup.
 */
function QuestionPrompt({ text }: { text: string }) {
  const parts = useMemo(() => text.split(/```[\w]*\n?/), [text])
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <pre
            key={i}
            className="bg-surface border border-border rounded-lg p-3 overflow-x-auto font-mono text-xs leading-relaxed"
          >
            <code>{part.trimEnd()}</code>
          </pre>
        ) : (
          <p key={i} className="whitespace-pre-wrap">
            <InlineCode text={part} />
          </p>
        ),
      )}
    </>
  )
}

function InlineCode({ text }: { text: string }) {
  const segments = text.split(/(`[^`]+`)/g)
  return (
    <>
      {segments.map((seg, i) =>
        seg.startsWith('`') && seg.endsWith('`') && seg.length > 2 ? (
          <code key={i}>{seg.slice(1, -1)}</code>
        ) : (
          seg
        ),
      )}
    </>
  )
}

function ChoiceInput({
  question, answer, committed, attempt, onChange,
}: {
  question: Extract<Question, { kind: 'choice' | 'multi' }>
  answer: Answer | undefined
  committed: boolean
  attempt: number
  onChange: (answer: Answer) => void
}) {
  // Shuffled per (question, attempt) so a retry is not pure muscle memory.
  const options = useMemo(
    () => shuffle(question.options, hashString(question.id) + attempt * 977),
    [question, attempt],
  )

  const chosen = new Set(answer?.kind === 'choice' ? answer.optionIds : [])
  const multi = question.kind === 'multi'

  const toggle = (id: string) => {
    if (committed) return
    if (multi) {
      const next = new Set(chosen)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      onChange({ kind: 'choice', optionIds: [...next] })
    } else {
      onChange({ kind: 'choice', optionIds: [id] })
    }
  }

  return (
    <div role={multi ? 'group' : 'radiogroup'} aria-label="Options" className="space-y-2">
      {multi && (
        <p className="text-xs text-ink-faint mb-1">Select all that apply.</p>
      )}
      {options.map((option) => {
        const picked = chosen.has(option.id)
        const reveal = committed
        const state = !reveal
          ? picked ? 'picked' : 'idle'
          : option.correct ? 'correct' : picked ? 'wrong' : 'idle'

        return (
          <button
            key={option.id}
            type="button"
            role={multi ? 'checkbox' : 'radio'}
            aria-checked={picked}
            disabled={committed}
            onClick={() => toggle(option.id)}
            className={cx(
              'w-full text-left px-3.5 py-2.5 rounded-lg border text-sm transition-colors flex gap-3',
              state === 'idle' && 'border-border bg-surface-raised hover:border-border-strong',
              state === 'picked' && 'border-accent bg-accent-soft',
              state === 'correct' && 'border-positive bg-positive-soft',
              state === 'wrong' && 'border-danger bg-danger-soft',
              committed && 'cursor-default',
            )}
          >
            <span
              className={cx(
                'shrink-0 w-4 h-4 mt-0.5 border flex items-center justify-center text-[0.625rem] font-bold',
                multi ? 'rounded' : 'rounded-full',
                state === 'correct' && 'border-positive text-positive',
                state === 'wrong' && 'border-danger text-danger',
                state === 'picked' && 'border-accent text-accent',
                state === 'idle' && 'border-border-strong text-transparent',
              )}
              aria-hidden="true"
            >
              {state === 'correct' ? '✓' : state === 'wrong' ? '✕' : picked ? '•' : ''}
            </span>
            <span className="min-w-0">
              <span className="block"><InlineCode text={option.text} /></span>
              {committed && option.feedback && (picked || option.correct) && (
                <span className="block mt-1.5 text-xs text-ink-muted">
                  <InlineCode text={option.feedback} />
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function OrderInput({
  question, answer, committed, attempt, onChange,
}: {
  question: Extract<Question, { kind: 'order' }>
  answer: Answer | undefined
  committed: boolean
  attempt: number
  onChange: (answer: Answer) => void
}) {
  const initial = useMemo(
    () => shuffle(question.items, hashString(question.id) + attempt * 131),
    [question, attempt],
  )
  const current = answer?.kind === 'order' && answer.items.length ? answer.items : initial

  const move = (from: number, to: number) => {
    if (committed || to < 0 || to >= current.length) return
    const next = [...current]
    const [item] = next.splice(from, 1)
    if (item !== undefined) next.splice(to, 0, item)
    onChange({ kind: 'order', items: next })
  }

  return (
    <>
      <p className="text-xs text-ink-faint mb-2">
        Put these in the right order. Use the arrows — they work with a keyboard too.
      </p>
      <ol className="space-y-1.5">
        {current.map((item, i) => {
          const correctHere = committed && question.items[i] === item
          return (
            <li
              key={item}
              className={cx(
                'flex items-center gap-2 px-3 py-2 rounded-lg border text-sm',
                !committed && 'border-border bg-surface-raised',
                correctHere && 'border-positive bg-positive-soft',
                committed && !correctHere && 'border-danger bg-danger-soft',
              )}
            >
              <span className="w-5 text-xs text-ink-faint tabular-nums">{i + 1}.</span>
              <span className="flex-1 min-w-0">{item}</span>
              {committed ? (
                <span className="text-xs text-ink-muted">
                  {correctHere ? '✓' : `should be ${question.items.indexOf(item) + 1}`}
                </span>
              ) : (
                <span className="flex gap-0.5">
                  <button
                    type="button"
                    onClick={() => move(i, i - 1)}
                    disabled={i === 0}
                    aria-label={`Move "${item}" up`}
                    className="px-1.5 py-0.5 rounded text-ink-muted hover:bg-surface disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, i + 1)}
                    disabled={i === current.length - 1}
                    aria-label={`Move "${item}" down`}
                    className="px-1.5 py-0.5 rounded text-ink-muted hover:bg-surface disabled:opacity-30"
                  >
                    ↓
                  </button>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </>
  )
}

function RecallInput({
  question, answer, committed, onChange,
}: {
  question: Extract<Question, { kind: 'recall' }>
  answer: Answer | undefined
  committed: boolean
  onChange: (answer: Answer) => void
}) {
  const text = answer?.kind === 'recall' ? answer.text : ''
  const selfGrade = answer?.kind === 'recall' ? answer.selfGrade : null

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor={`recall-${question.id}`} className="sr-only">Your answer</label>
        <textarea
          id={`recall-${question.id}`}
          value={text}
          onChange={(e) => onChange({ kind: 'recall', text: e.target.value, selfGrade })}
          disabled={committed}
          rows={6}
          placeholder="Write it out in your own words. Trying to explain it is where the learning happens — that is why the model answer is hidden until you have."
          className={cx(
            'w-full rounded-lg border border-border-strong bg-surface-raised p-3 text-sm',
            'placeholder:text-ink-faint resize-y leading-relaxed text-ink',
            'focus:border-accent focus:outline-none disabled:opacity-70',
          )}
        />
        {!committed && (
          <p className="mt-1.5 text-xs text-ink-faint">
            {text.trim().split(/\s+/).filter(Boolean).length} words. Nobody reads this but
            you — it is stored only in your browser.
          </p>
        )}
      </div>

      {committed && (
        <>
          <div className="rounded-lg border border-border bg-surface p-4">
            <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
              Did you cover these?
            </h4>
            <ul className="space-y-1.5 text-sm">
              {question.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-accent mt-0.5" aria-hidden="true">•</span>
                  <span><InlineCode text={point} /></span>
                </li>
              ))}
            </ul>

            {question.model && (
              <details className="mt-4 pt-3 border-t border-border">
                <summary className="text-xs font-bold uppercase tracking-wide text-ink-muted cursor-pointer hover:text-ink">
                  A model answer
                </summary>
                <p className="mt-2.5 text-sm text-ink-muted leading-relaxed">
                  <InlineCode text={question.model} />
                </p>
              </details>
            )}
          </div>

          <fieldset>
            <legend className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
              How did you do? Be honest — this feeds your review schedule.
            </legend>
            <div className="flex flex-wrap gap-2">
              {([
                ['got-it', 'I covered it', 'positive'],
                ['partly', 'Partly', 'caution'],
                ['missed', 'I missed it', 'danger'],
              ] as const).map(([value, label, tone]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange({ kind: 'recall', text, selfGrade: value })}
                  aria-pressed={selfGrade === value}
                  className={cx(
                    'px-3 py-1.5 rounded-lg border text-sm transition-colors',
                    selfGrade === value
                      ? tone === 'positive'
                        ? 'border-positive bg-positive-soft text-positive'
                        : tone === 'caution'
                          ? 'border-caution bg-caution-soft text-caution'
                          : 'border-danger bg-danger-soft text-danger'
                      : 'border-border text-ink-muted hover:border-border-strong',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- feedback */

function Feedback({
  question, graded,
}: { question: Question; graded: ReturnType<typeof gradeAnswer> }) {
  if (question.kind === 'recall') {
    return question.explanation ? (
      <p className="mt-4 text-sm text-ink-muted leading-relaxed">
        <InlineCode text={question.explanation} />
      </p>
    ) : null
  }

  return (
    <div
      className={cx(
        'mt-4 rounded-lg border p-4',
        graded.correct ? 'border-positive/40 bg-positive-soft' : 'border-caution/40 bg-caution-soft',
      )}
      role="status"
    >
      <p
        className={cx(
          'text-xs font-bold uppercase tracking-wide mb-1.5',
          graded.correct ? 'text-positive' : 'text-caution',
        )}
      >
        {graded.correct
          ? 'Correct'
          : graded.score > 0
            ? `Partly right — ${Math.round(graded.score * 100)}%`
            : 'Not quite'}
      </p>
      <p className="text-sm text-ink leading-relaxed">
        <InlineCode text={question.explanation} />
      </p>
    </div>
  )
}

/* ----------------------------------------------------------------- results */

function QuizResults({
  quiz, answers, onRestart,
}: { quiz: QuizData; answers: Map<string, Answer>; onRestart: () => void }) {
  const result = gradeQuiz(quiz, answers)
  const pct = Math.round(result.score * 100)

  return (
    <Card className="p-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p
            className={cx(
              'text-xs font-bold uppercase tracking-wide',
              result.passed ? 'text-positive' : 'text-caution',
            )}
          >
            {result.passed ? 'Passed' : 'Not yet'}
          </p>
          <p className="text-3xl font-semibold tabular-nums mt-1 text-ink">{pct}%</p>
          <p className="text-sm text-ink-muted mt-1">
            {result.correctCount} of {result.total} fully correct
            {!result.passed && ` · ${Math.round(quiz.passScore * 100)}% needed`}
          </p>
        </div>
        <Button variant={result.passed ? 'secondary' : 'primary'} onClick={onRestart}>
          {result.passed ? 'Try again' : 'Retake with reshuffled options'}
        </Button>
      </div>

      {result.weakConcepts.length > 0 && (
        <div className="mt-6 pt-5 border-t border-border">
          <h4 className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
            Worth another look
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {result.weakConcepts.map((concept) => (
              <span
                key={concept}
                className="text-xs px-2 py-1 rounded-md bg-caution-soft text-caution border border-caution/25 font-mono"
              >
                {concept}
              </span>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-ink-faint leading-relaxed">
            These have been added to your review queue. You will be asked about them again
            in a few days — which is when it actually sticks.
          </p>
        </div>
      )}

      <ol className="mt-6 pt-5 border-t border-border space-y-2">
        {quiz.questions.map((question, i) => {
          const graded = result.answers[i]
          return (
            <li key={question.id} className="flex items-start gap-2.5 text-sm">
              <span
                className={cx(
                  'shrink-0 w-4 h-4 mt-0.5 rounded-full flex items-center justify-center text-[0.625rem] font-bold',
                  graded?.correct
                    ? 'bg-positive-soft text-positive'
                    : (graded?.score ?? 0) > 0
                      ? 'bg-caution-soft text-caution'
                      : 'bg-danger-soft text-danger',
                )}
                aria-hidden="true"
              >
                {graded?.correct ? '✓' : (graded?.score ?? 0) > 0 ? '~' : '✕'}
              </span>
              <span className="text-ink-muted min-w-0">
                {question.prompt.split('\n')[0]?.slice(0, 110)}
                {(question.prompt.split('\n')[0]?.length ?? 0) > 110 && '…'}
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}

/** Stable seed from a question id, so option order is consistent across reloads. */
function hashString(value: string): number {
  let hash = 2166136261
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}
