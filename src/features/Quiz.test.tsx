import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Quiz } from './Quiz'
import type { Quiz as QuizData } from '@/content/types'

const QUIZ: QuizData = {
  passScore: 0.7,
  questions: [
    {
      id: 'q1',
      kind: 'choice',
      prompt: 'What is 2 + 2?',
      explanation: 'Addition combines two quantities.',
      concept: 'arithmetic',
      options: [
        { id: 'a', text: 'Three', correct: false, feedback: 'Off by one.' },
        { id: 'b', text: 'Four', correct: true, feedback: 'Yes.' },
        { id: 'c', text: 'Five', correct: false, feedback: 'Too many.' },
      ],
    },
    {
      id: 'q2',
      kind: 'recall',
      prompt: 'Explain addition.',
      explanation: '',
      concept: 'arithmetic',
      keyPoints: ['combines quantities', 'is commutative'],
      model: 'Addition combines two numbers into their sum.',
    },
  ],
}

beforeEach(() => {
  // Options are shuffled, so tests must find them by text rather than position.
})

describe('Quiz — the answer is never shown before the learner commits', () => {
  it('does not reveal which option is correct until Check answer is pressed', async () => {
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    // The explanation must not be in the document before committing.
    expect(screen.queryByText(/Addition combines two quantities/)).not.toBeInTheDocument()
    expect(screen.queryByText('Yes.')).not.toBeInTheDocument()
  })

  it('keeps Check answer disabled until an option is chosen', async () => {
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)
    expect(screen.getByRole('button', { name: /check answer/i })).toBeDisabled()
  })

  it('reveals the explanation and feedback after committing', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /four/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))

    expect(screen.getByText(/Addition combines two quantities/)).toBeInTheDocument()
    expect(screen.getByText('Correct')).toBeInTheDocument()
  })

  it('shows "Not quite" and still explains when the answer is wrong', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /three/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))

    expect(screen.getByText('Not quite')).toBeInTheDocument()
    expect(screen.getByText(/Addition combines two quantities/)).toBeInTheDocument()
    // The wrong choice gets its own targeted feedback.
    expect(screen.getByText('Off by one.')).toBeInTheDocument()
  })

  it('locks the options once committed, so the score cannot be changed after the fact', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /three/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))

    expect(screen.getByRole('radio', { name: /four/i })).toBeDisabled()
  })
})

describe('Quiz — recall questions', () => {
  it('hides the key points and model answer until the learner has written something', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    // Move to question two.
    await user.click(screen.getByRole('radio', { name: /four/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))

    expect(screen.getByText('Explain addition.')).toBeInTheDocument()
    expect(screen.queryByText('combines quantities')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reveal the model answer/i })).toBeDisabled()
  })

  it('reveals key points and asks for a self-assessment once written', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /four/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))

    await user.type(screen.getByLabelText(/your answer/i), 'It combines two numbers.')
    await user.click(screen.getByRole('button', { name: /reveal the model answer/i }))

    expect(screen.getByText('combines quantities')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /i covered it/i })).toBeInTheDocument()
  })
})

describe('Quiz — results', () => {
  it('reports the score and names the concepts that were missed', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={onComplete} />)

    await user.click(screen.getByRole('radio', { name: /three/i }))   // wrong
    await user.click(screen.getByRole('button', { name: /check answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.type(screen.getByLabelText(/your answer/i), 'something')
    await user.click(screen.getByRole('button', { name: /reveal the model answer/i }))
    await user.click(screen.getByRole('button', { name: /i missed it/i }))
    await user.click(screen.getByRole('button', { name: /see results/i }))

    expect(screen.getByText('Not yet')).toBeInTheDocument()
    expect(screen.getByText('0%')).toBeInTheDocument()
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ passed: false, score: 0 }),
    )
    expect(screen.getByText('arithmetic')).toBeInTheDocument()
  })

  it('passes the result to the caller with per-concept outcomes for the review queue', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={onComplete} />)

    await user.click(screen.getByRole('radio', { name: /four/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.type(screen.getByLabelText(/your answer/i), 'ok')
    await user.click(screen.getByRole('button', { name: /reveal the model answer/i }))
    await user.click(screen.getByRole('button', { name: /i covered it/i }))
    await user.click(screen.getByRole('button', { name: /see results/i }))

    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        passed: true,
        perConcept: [
          { concept: 'arithmetic', correct: true },
          { concept: 'arithmetic', correct: true },
        ],
      }),
    )
  })

  it('allows a retake', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)

    await user.click(screen.getByRole('radio', { name: /three/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))
    await user.click(screen.getByRole('button', { name: /next/i }))
    await user.type(screen.getByLabelText(/your answer/i), 'x')
    await user.click(screen.getByRole('button', { name: /reveal the model answer/i }))
    await user.click(screen.getByRole('button', { name: /i missed it/i }))
    await user.click(screen.getByRole('button', { name: /see results/i }))

    await user.click(screen.getByRole('button', { name: /retake/i }))
    expect(screen.getByText('What is 2 + 2?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /check answer/i })).toBeDisabled()
  })
})

describe('Quiz — accessibility', () => {
  it('exposes single-choice options as radios in a radiogroup', () => {
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)
    const group = screen.getByRole('radiogroup', { name: /options/i })
    expect(within(group).getAllByRole('radio')).toHaveLength(3)
  })

  it('exposes progress through the quiz to assistive technology', () => {
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('announces feedback as a status region', async () => {
    const user = userEvent.setup()
    render(<Quiz quiz={QUIZ} lessonId="x" onComplete={vi.fn()} />)
    await user.click(screen.getByRole('radio', { name: /four/i }))
    await user.click(screen.getByRole('button', { name: /check answer/i }))
    expect(screen.getByRole('status')).toBeInTheDocument()
  })
})
