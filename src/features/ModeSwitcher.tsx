/**
 * The learning-mode selector (brief §68–§72).
 *
 * Only modes the lesson actually has content for are offered — `lesson.modes` is computed
 * at build time from the blocks present. Offering a mode that would render an empty page
 * would be a "coming soon" button by another name.
 */
import { modeSpecs } from '@/content/catalog'
import type { ModeName } from '@/content/types'
import { cx } from '@/ui/primitives'

export function ModeSwitcher({
  available, value, onChange,
}: { available: ModeName[]; value: ModeName; onChange: (mode: ModeName) => void }) {
  if (available.length <= 1) return null

  return (
    <div className="border border-border rounded-xl bg-surface-raised overflow-hidden">
      <div
        role="radiogroup"
        aria-label="Reading mode"
        className="flex flex-wrap gap-0.5 p-1"
      >
        {available.map((name) => {
          const spec = modeSpecs[name]
          if (!spec) return null
          const selected = value === name
          return (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(name)}
              className={cx(
                'px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                selected
                  ? 'bg-accent text-white'
                  : 'text-ink-muted hover:text-ink hover:bg-surface',
              )}
            >
              {spec.label}
            </button>
          )
        })}
      </div>
      <p className="px-3 pb-2.5 pt-0.5 text-xs text-ink-faint leading-snug">
        {modeSpecs[value]?.blurb}
        {value !== 'full' && ' Everything else is dimmed — hover to read it.'}
      </p>
    </div>
  )
}
