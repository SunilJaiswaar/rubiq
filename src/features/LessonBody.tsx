/**
 * Renders the pre-rendered lesson HTML and wires up the behaviour it needs.
 *
 * The HTML comes from scripts/lib/markdown.mjs with `html: false`, so it contains no
 * markup from content authors — only tags that file emits. That is what makes
 * `dangerouslySetInnerHTML` defensible here: the sanitisation decision was made once, at
 * build time, in one reviewable place, rather than per render.
 *
 * Three things are attached after mount:
 *   1. Copy buttons on code fences.
 *   2. SPA navigation for internal links (so they do not reload the page).
 *   3. `data-active` on blocks belonging to the current learning mode.
 */
import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { modeSpecs } from '@/content/catalog'
import type { ModeName } from '@/content/types'

export function LessonBody({
  html, mode, onRunCode,
}: {
  html: string
  mode: ModeName
  onRunCode?: (code: string, language: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  /* ------------------------------------------------- copy & run controls */
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement

      const copyButton = target.closest<HTMLButtonElement>('[data-copy]')
      if (copyButton) {
        const code = copyButton.closest('.code')?.querySelector('code')?.textContent ?? ''
        void navigator.clipboard?.writeText(code)?.then(
          () => {
            copyButton.dataset.copied = 'true'
            copyButton.textContent = 'Copied'
            setTimeout(() => {
              copyButton.dataset.copied = 'false'
              copyButton.textContent = 'Copy'
            }, 1600)
          },
          () => {
            // Clipboard can be denied. Say so rather than appearing to work.
            copyButton.textContent = 'Press ⌘C'
            setTimeout(() => { copyButton.textContent = 'Copy' }, 1600)
          },
        )
        return
      }

      const runButton = target.closest<HTMLButtonElement>('[data-run]')
      if (runButton && onRunCode) {
        const figure = runButton.closest<HTMLElement>('.code')
        const code = figure?.querySelector('code')?.textContent ?? ''
        onRunCode(code, figure?.dataset.lang ?? 'text')
      }
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html, onRunCode])

  /* ----------------------------------------- Run buttons on runnable fences */
  useEffect(() => {
    const root = ref.current
    if (!root || !onRunCode) return

    const added: HTMLButtonElement[] = []
    for (const figure of root.querySelectorAll<HTMLElement>('.code[data-runnable="true"]')) {
      if (figure.querySelector('[data-run]')) continue
      const button = document.createElement('button')
      button.type = 'button'
      button.dataset.run = 'true'
      button.textContent = 'Run ▸'
      button.className =
        'absolute top-1 right-16 text-[0.6875rem] font-semibold px-2 py-0.5 rounded ' +
        'border border-accent text-accent bg-surface-raised hover:bg-accent-soft'
      button.setAttribute('aria-label', `Run this ${figure.dataset.lang ?? ''} example`)
      figure.appendChild(button)
      added.push(button)
    }
    return () => added.forEach((b) => b.remove())
  }, [html, onRunCode])

  /* ---------------------------------------------- internal link navigation */
  useEffect(() => {
    const root = ref.current
    if (!root) return

    const onClick = (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[data-internal]')
      if (!anchor) return
      // Leave modified clicks (new tab, download) to the browser.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
      const href = anchor.getAttribute('href')
      if (!href?.startsWith('/')) return
      event.preventDefault()
      void navigate(href)
    }

    root.addEventListener('click', onClick)
    return () => root.removeEventListener('click', onClick)
  }, [html, navigate])

  /* -------------------------------------------------------- mode filtering */
  useEffect(() => {
    const root = ref.current
    if (!root) return
    const active = modeSpecs[mode]?.blocks
    for (const block of root.querySelectorAll<HTMLElement>('.lesson-block')) {
      const name = block.dataset.block ?? ''
      block.dataset.active = String(active === null || active === undefined || active.includes(name as never))
    }
  }, [html, mode])

  return (
    <div
      ref={ref}
      className="prose"
      data-mode={mode}
      // Safe: this HTML was produced at build time by our own renderer with raw HTML
      // disabled. See the note at the top of this file.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
