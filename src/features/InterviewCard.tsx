/**
 * An interview question with progressive reveal (brief §35, §72).
 *
 * The stages are Think → Hint → Answer → Follow-ups, and each one has to be asked for.
 * The reason is specific: reading a good answer produces a strong feeling of understanding
 * and very little actual recall. Being made to attempt it first is uncomfortable and is
 * what works. So the answer is never visible on arrival, and the card says why.
 */
import { useState } from 'react'
import type { InterviewQuestion } from '@/content/types'
import { Card, Button, Badge, LevelBadge, cx } from '@/ui/primitives'

type Stage = 'question' | 'hint' | 'answer' | 'followups'

export function InterviewCard({
  question, lessonTitle, defaultOpen = false,
}: { question: InterviewQuestion; lessonTitle?: string | undefined; defaultOpen?: boolean }) {
  const [stage, setStage] = useState<Stage>(defaultOpen ? 'answer' : 'question')
  const [thought, setThought] = useState('')
  const [attempted, setAttempted] = useState(false)

  const hasHint = Boolean(question.hint)

  return (
    <Card className="overflow-hidden">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2">
            {question.level && <LevelBadge level={question.level} />}
            {lessonTitle && <Badge>{lessonTitle}</Badge>}
          </div>
        </div>

        <p className="text-[0.9375rem] font-medium leading-relaxed text-ink">
          {question.question}
        </p>

        {/* --- stage 1: attempt it --- */}
        {stage === 'question' && (
          <div className="mt-4">
            <label htmlFor={`attempt-${slug(question.question)}`} className="sr-only">
              Your answer
            </label>
            <textarea
              id={`attempt-${slug(question.question)}`}
              value={thought}
              onChange={(e) => { setThought(e.target.value); setAttempted(true) }}
              rows={4}
              placeholder="Say it out loud, or sketch it here. Either way, commit to an answer before revealing anything — that is the whole mechanism."
              className="w-full text-sm rounded-lg border border-border-strong bg-surface p-3 resize-y placeholder:text-ink-faint text-ink focus:border-accent focus:outline-none leading-relaxed"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              {hasHint && (
                <Button size="sm" onClick={() => setStage('hint')}>
                  Give me a nudge
                </Button>
              )}
              <Button
                size="sm"
                variant={attempted ? 'primary' : 'secondary'}
                onClick={() => setStage('answer')}
              >
                {attempted ? 'Show a strong answer' : 'Skip to the answer'}
              </Button>
            </div>
            {!attempted && (
              <p className="mt-2 text-xs text-ink-faint">
                You can skip, but a question you have not attempted teaches you roughly
                nothing.
              </p>
            )}
          </div>
        )}

        {/* --- stage 2: hint --- */}
        {stage === 'hint' && (
          <div className="mt-4">
            <div className="rounded-lg border border-caution/30 bg-caution-soft p-3.5">
              <p className="text-xs font-bold uppercase tracking-wide text-caution mb-1.5">
                Nudge
              </p>
              <p className="text-sm text-ink leading-relaxed">{question.hint}</p>
            </div>
            <Button size="sm" variant="primary" className="mt-3" onClick={() => setStage('answer')}>
              Show a strong answer
            </Button>
          </div>
        )}

        {/* --- stage 3: answer --- */}
        {(stage === 'answer' || stage === 'followups') && (
          <div className="mt-4 space-y-4">
            {thought.trim() && (
              <details className="rounded-lg border border-border bg-surface p-3.5">
                <summary className="text-xs font-bold uppercase tracking-wide text-ink-muted cursor-pointer">
                  What you said
                </summary>
                <p className="mt-2 text-sm text-ink-muted whitespace-pre-wrap leading-relaxed">
                  {thought}
                </p>
              </details>
            )}

            <div className="rounded-lg border border-positive/30 bg-positive-soft p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-positive mb-2">
                A strong answer
              </p>
              <p className="text-sm text-ink leading-relaxed">{question.answer}</p>
            </div>

            {question.realWorld && (
              <div className="rounded-lg border border-border bg-surface p-3.5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted mb-1.5">
                  Where this shows up
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">{question.realWorld}</p>
              </div>
            )}

            {question.followUps && question.followUps.length > 0 && (
              stage === 'followups' ? (
                <div className="rounded-lg border border-interview/30 bg-interview-soft p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-interview mb-2">
                    What they will ask next
                  </p>
                  <ul className="space-y-2">
                    {question.followUps.map((followUp, i) => (
                      <li key={i} className="text-sm text-ink leading-relaxed flex gap-2">
                        <span className="text-interview shrink-0" aria-hidden="true">→</span>
                        <span>{followUp}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-xs text-ink-muted">
                    Answer these before moving on. A real interview is the follow-ups —
                    the first question only opens the conversation.
                  </p>
                </div>
              ) : (
                <Button size="sm" onClick={() => setStage('followups')}>
                  Show {question.followUps.length} follow-up
                  {question.followUps.length === 1 ? '' : 's'}
                </Button>
              )
            )}

            <button
              type="button"
              onClick={() => { setStage('question'); setThought(''); setAttempted(false) }}
              className="text-xs text-ink-faint hover:text-ink-muted underline"
            >
              Reset and try again from scratch
            </button>
          </div>
        )}
      </div>

      {/* Progress indicator for the reveal ladder. */}
      <div className="h-0.5 bg-surface flex" aria-hidden="true">
        {(['question', 'hint', 'answer', 'followups'] as Stage[]).map((s) => (
          <div
            key={s}
            className={cx(
              'flex-1 transition-colors',
              reached(stage, s) ? 'bg-accent' : 'bg-transparent',
            )}
          />
        ))}
      </div>
    </Card>
  )
}

const ORDER: Stage[] = ['question', 'hint', 'answer', 'followups']
const reached = (current: Stage, target: Stage): boolean =>
  ORDER.indexOf(current) >= ORDER.indexOf(target)

const slug = (text: string): string =>
  text.toLowerCase().replace(/[^\w]+/g, '-').slice(0, 40)
