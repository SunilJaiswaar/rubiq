import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { InterviewCard } from './InterviewCard'
import type { InterviewQuestion } from '@/content/types'

const QUESTION: InterviewQuestion = {
  question: 'How does Ruby find a method?',
  level: 'intermediate',
  hint: 'Start from the object, not the class.',
  answer: 'It walks the ancestor chain and the first match wins.',
  followUps: ['Which wins if two modules define it?', 'How do you insert behaviour before the class?'],
  realWorld: 'This is how Rails concerns work.',
}

describe('InterviewCard — progressive reveal', () => {
  it('shows only the question on arrival', () => {
    render(<InterviewCard question={QUESTION} />)
    expect(screen.getByText(QUESTION.question)).toBeInTheDocument()
    expect(screen.queryByText(QUESTION.answer)).not.toBeInTheDocument()
    expect(screen.queryByText(QUESTION.hint!)).not.toBeInTheDocument()
  })

  it('reveals the hint without revealing the answer', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: /nudge/i }))
    expect(screen.getByText(QUESTION.hint!)).toBeInTheDocument()
    expect(screen.queryByText(QUESTION.answer)).not.toBeInTheDocument()
  })

  it('reveals the answer only when asked', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: /skip to the answer/i }))
    expect(screen.getByText(QUESTION.answer)).toBeInTheDocument()
  })

  it('keeps follow-ups behind a further click, because the follow-ups are the interview', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: /skip to the answer/i }))
    expect(screen.queryByText(QUESTION.followUps![0]!)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /show 2 follow-ups/i }))
    expect(screen.getByText(QUESTION.followUps![0]!)).toBeInTheDocument()
    expect(screen.getByText(QUESTION.followUps![1]!)).toBeInTheDocument()
  })

  it('nudges the learner when they skip without attempting', () => {
    render(<InterviewCard question={QUESTION} />)
    expect(screen.getByRole('button', { name: /skip to the answer/i })).toBeInTheDocument()
    expect(screen.getByText(/teaches you roughly nothing/i)).toBeInTheDocument()
  })

  it('changes the primary action once the learner has written something', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={QUESTION} />)

    await user.type(screen.getByLabelText(/your answer/i), 'It walks the ancestors.')
    expect(screen.getByRole('button', { name: /show a strong answer/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /skip to the answer/i })).not.toBeInTheDocument()
  })

  it('keeps the learner’s own attempt available for comparison', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={QUESTION} />)

    await user.type(screen.getByLabelText(/your answer/i), 'my attempt here')
    await user.click(screen.getByRole('button', { name: /show a strong answer/i }))

    expect(screen.getByText(/what you said/i)).toBeInTheDocument()
    expect(screen.getByText('my attempt here')).toBeInTheDocument()
  })

  it('can be reset back to the unanswered state', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={QUESTION} />)

    await user.click(screen.getByRole('button', { name: /skip to the answer/i }))
    await user.click(screen.getByRole('button', { name: /reset and try again/i }))

    expect(screen.queryByText(QUESTION.answer)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/your answer/i)).toHaveValue('')
  })

  it('handles a question with no hint and no follow-ups', async () => {
    const user = userEvent.setup()
    render(<InterviewCard question={{ question: 'Bare question?', answer: 'Bare answer.' }} />)

    expect(screen.queryByRole('button', { name: /nudge/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /answer/i }))
    expect(screen.getByText('Bare answer.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /follow-up/i })).not.toBeInTheDocument()
  })
})
