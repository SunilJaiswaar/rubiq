/**
 * The editor, behind a narrow interface.
 *
 * Monaco is ~1 MB and is the single largest thing this app can load, so:
 *   - it is imported lazily, reached only by opening a playground or exercise;
 *   - it is bundled locally rather than loaded from a CDN, so offline use works and no
 *     third party sees which lessons a learner opens;
 *   - a plain <textarea> is rendered until it arrives, and if it fails to load the
 *     textarea simply stays. The learner can always type and run code.
 *
 * That last point is the reason for the abstraction. An editor is a nicety; being able to
 * write code is not.
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { cx } from '@/ui/primitives'

const MonacoEditor = lazy(() => import('./MonacoEditor'))

export interface CodeEditorProps {
  value: string
  onChange: (value: string) => void
  language: string
  height?: number | string
  readOnly?: boolean
  onRun?: () => void
  ariaLabel: string
}

export function CodeEditor(props: CodeEditorProps) {
  // Only attempt Monaco once the component is actually on screen.
  const [visible, setVisible] = useState(false)
  const [monacoFailed, setMonacoFailed] = useState(false)
  const holder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = holder.current
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={holder} data-editor>
      {visible && !monacoFailed ? (
        <Suspense fallback={<PlainEditor {...props} loading />}>
          <ErrorToTextarea onError={() => setMonacoFailed(true)} fallback={props}>
            <MonacoEditor {...props} />
          </ErrorToTextarea>
        </Suspense>
      ) : (
        <PlainEditor {...props} />
      )}
    </div>
  )
}

/**
 * A real textarea, used while Monaco loads and permanently if it cannot.
 * Tab inserts two spaces and Ctrl/Cmd+Enter runs, so it is genuinely usable.
 */
function PlainEditor({
  value, onChange, height = 320, readOnly, onRun, ariaLabel, loading,
}: CodeEditorProps & { loading?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null)

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault()
      onRun?.()
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const el = ref.current
      if (!el) return
      const { selectionStart: start, selectionEnd: end } = el
      const next = `${value.slice(0, start)}  ${value.slice(end)}`
      onChange(next)
      requestAnimationFrame(() => el.setSelectionRange(start + 2, start + 2))
    }
  }

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        readOnly={readOnly}
        aria-label={ariaLabel}
        spellCheck={false}
        autoComplete="off"
        autoCapitalize="off"
        className={cx(
          'w-full font-mono text-[0.8125rem] leading-relaxed p-4 resize-y',
          'bg-surface text-ink border-0 outline-none',
        )}
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      />
      {loading && (
        <span className="absolute top-2 right-3 text-[0.625rem] text-ink-faint">
          loading editor…
        </span>
      )}
    </div>
  )
}

/**
 * Catches a Monaco load/render failure and falls back to the textarea.
 * A React error boundary has to be a class — there is no hook equivalent.
 */
import { Component, type ReactNode } from 'react'

class ErrorToTextarea extends Component<
  { children: ReactNode; onError: () => void; fallback: CodeEditorProps },
  { failed: boolean }
> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch() {
    this.props.onError()
  }

  override render() {
    if (this.state.failed) return <PlainEditor {...this.props.fallback} />
    return this.props.children
  }
}
