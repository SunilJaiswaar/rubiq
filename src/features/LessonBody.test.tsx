import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LessonBody } from './LessonBody'

/** The shape scripts/lib/markdown.mjs emits. */
const HTML = `
<p>Intro paragraph.</p>
<section class="lesson-block" data-block="why" data-tone="why" aria-label="Why it exists">
  <header class="lesson-block__head"><h4 class="lesson-block__title">Why it exists</h4></header>
  <div class="lesson-block__body"><p>The motivating problem.</p></div>
</section>
<section class="lesson-block" data-block="internals" data-tone="internals" aria-label="Under the hood">
  <header class="lesson-block__head"><h4 class="lesson-block__title">Under the hood</h4></header>
  <div class="lesson-block__body"><p>One layer down.</p></div>
</section>
<figure class="code" data-lang="ruby" data-runnable="true">
  <figcaption class="code__lang">ruby</figcaption>
  <pre class="code__pre"><code>puts 1 + 1</code></pre>
  <button type="button" class="code__copy" data-copy aria-label="Copy ruby code">Copy</button>
</figure>
<p><a href="/learn/ruby/blocks" data-internal="true">An internal link</a></p>
<p><a href="https://example.com" class="link-external" target="_blank" rel="noopener noreferrer">External</a></p>
`

const renderBody = (props: Partial<Parameters<typeof LessonBody>[0]> = {}) =>
  render(
    <MemoryRouter>
      <LessonBody html={HTML} mode="full" {...props} />
    </MemoryRouter>,
  )

describe('LessonBody — mode filtering', () => {
  it('marks every block active in full mode', () => {
    const { container } = renderBody({ mode: 'full' })
    const blocks = container.querySelectorAll('.lesson-block')
    expect(blocks).toHaveLength(2)
    for (const block of blocks) expect(block.getAttribute('data-active')).toBe('true')
  })

  it('activates only the why block in why mode', () => {
    const { container } = renderBody({ mode: 'why' })
    expect(container.querySelector('[data-block="why"]')?.getAttribute('data-active')).toBe('true')
    expect(container.querySelector('[data-block="internals"]')?.getAttribute('data-active')).toBe('false')
  })

  it('activates only the internals block in internals mode', () => {
    const { container } = renderBody({ mode: 'internals' })
    expect(container.querySelector('[data-block="internals"]')?.getAttribute('data-active')).toBe('true')
    expect(container.querySelector('[data-block="why"]')?.getAttribute('data-active')).toBe('false')
  })

  it('never removes content from the DOM, so screen readers and find-in-page still work', () => {
    renderBody({ mode: 'why' })
    // The internals text is dimmed by CSS, not deleted.
    expect(screen.getByText('One layer down.')).toBeInTheDocument()
    expect(screen.getByText('Intro paragraph.')).toBeInTheDocument()
  })

  it('records the active mode on the container so CSS can do the dimming', () => {
    const { container } = renderBody({ mode: 'failure' })
    expect(container.querySelector('.prose')?.getAttribute('data-mode')).toBe('failure')
  })
})

describe('LessonBody — code controls', () => {
  it('copies a code fence to the clipboard', async () => {
    const user = userEvent.setup()

    // userEvent.setup() installs its own navigator.clipboard stub, so ours has to be
    // defined *after* it — and with defineProperty, since the property is a read-only
    // accessor in jsdom.
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    renderBody()
    await user.click(screen.getByRole('button', { name: /copy ruby code/i }))
    expect(writeText).toHaveBeenCalledWith('puts 1 + 1')
  })

  it('adds a Run button only to fences marked runnable, and only when a handler exists', () => {
    const { container: without } = renderBody()
    expect(without.querySelector('[data-run]')).toBeNull()

    const { container: withHandler } = renderBody({ onRunCode: vi.fn() })
    expect(withHandler.querySelector('[data-run]')).not.toBeNull()
  })

  it('passes the fence source and language to the run handler', async () => {
    const onRunCode = vi.fn()
    const user = userEvent.setup()
    renderBody({ onRunCode })

    await user.click(screen.getByRole('button', { name: /run this ruby example/i }))
    expect(onRunCode).toHaveBeenCalledWith('puts 1 + 1', 'ruby')
  })
})

describe('LessonBody — links', () => {
  it('keeps external links marked for a new tab with a safe rel', () => {
    renderBody()
    const external = screen.getByRole('link', { name: 'External' })
    expect(external).toHaveAttribute('target', '_blank')
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('renders internal links as same-document anchors for SPA navigation', () => {
    renderBody()
    const internal = screen.getByRole('link', { name: 'An internal link' })
    expect(internal).toHaveAttribute('data-internal', 'true')
    expect(internal).toHaveAttribute('href', '/learn/ruby/blocks')
  })
})
