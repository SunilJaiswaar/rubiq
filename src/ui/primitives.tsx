/**
 * Design-system primitives. No application logic lives here — these components know
 * about spacing, colour tokens and accessibility, and nothing about lessons or progress.
 */
import {
  forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode,
} from 'react'
import { Link, type LinkProps } from 'react-router-dom'

const cx = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

export { cx }

/* ----------------------------------------------------------------- Button */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover border border-transparent shadow-sm',
  secondary:
    'bg-surface-raised text-ink border border-border hover:border-border-strong hover:bg-surface',
  ghost:
    'bg-transparent text-ink-muted border border-transparent hover:text-ink hover:bg-surface',
  danger:
    'bg-transparent text-danger border border-danger/40 hover:bg-danger-soft',
}

const SIZES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
  lg: 'text-base px-5 py-2.5 gap-2',
}

const BUTTON_BASE =
  'inline-flex items-center justify-center font-medium rounded-lg transition-colors ' +
  'disabled:opacity-45 disabled:cursor-not-allowed select-none'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cx(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  ),
)
Button.displayName = 'Button'

export interface ButtonLinkProps extends LinkProps {
  variant?: Variant
  size?: Size
}

export function ButtonLink({
  variant = 'secondary', size = 'md', className, ...rest
}: ButtonLinkProps) {
  return (
    <Link
      className={cx(BUTTON_BASE, VARIANTS[variant], SIZES[size], className)}
      {...rest}
    />
  )
}

/* ------------------------------------------------------------------- Card */

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'bg-surface-raised border border-border rounded-xl',
        className,
      )}
      {...rest}
    />
  )
}

/* ------------------------------------------------------------------ Badge */

const TONES = {
  neutral: 'bg-surface text-ink-muted border-border',
  accent: 'bg-accent-soft text-accent-ink border-accent/25',
  positive: 'bg-positive-soft text-positive border-positive/25',
  caution: 'bg-caution-soft text-caution border-caution/25',
  danger: 'bg-danger-soft text-danger border-danger/25',
} as const

export function Badge({
  tone = 'neutral', className, children, ...rest
}: HTMLAttributes<HTMLSpanElement> & { tone?: keyof typeof TONES }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 text-[0.6875rem] font-semibold uppercase tracking-wide',
        'px-2 py-0.5 rounded-full border whitespace-nowrap',
        TONES[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  )
}

/* --------------------------------------------------------------- Progress */

export function ProgressBar({
  value, label, tone = 'accent', showValue = true,
}: {
  value: number
  label?: string
  tone?: 'accent' | 'positive' | 'caution'
  showValue?: boolean
}) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  const barColour =
    tone === 'positive' ? 'bg-positive' : tone === 'caution' ? 'bg-caution' : 'bg-accent'

  return (
    <div>
      {(label || showValue) && (
        <div className="flex items-baseline justify-between mb-1.5 text-xs">
          {label && <span className="text-ink-muted">{label}</span>}
          {showValue && <span className="text-ink-faint tabular-nums">{pct}%</span>}
        </div>
      )}
      <div
        className="h-1.5 rounded-full bg-surface overflow-hidden border border-border"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'Progress'}
      >
        <div
          className={cx('h-full rounded-full transition-[width] duration-500', barColour)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

/* ----------------------------------------------------------- Skill meter */

/**
 * A segmented bar, used for skill gaps. Segments rather than a smooth bar because a
 * mastery estimate is not precise to the percentage point, and a smooth bar implies
 * precision we do not have.
 */
export function SkillMeter({
  value, segments = 6, estimated = false,
}: { value: number; segments?: number; estimated?: boolean }) {
  const filled = Math.round(Math.min(1, Math.max(0, value)) * segments)
  return (
    <span
      className="inline-flex gap-0.5 items-center"
      role="img"
      aria-label={`${Math.round(value * 100)}% ${estimated ? '(estimated)' : 'mastery'}`}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={cx(
            'w-2.5 h-3.5 rounded-[2px]',
            i < filled
              ? estimated ? 'bg-ink-faint/50' : 'bg-accent'
              : 'bg-surface border border-border',
          )}
        />
      ))}
    </span>
  )
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  title, children, action,
}: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="text-center py-14 px-6">
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {children && (
        <div className="mt-2 text-sm text-ink-muted max-w-md mx-auto leading-relaxed">
          {children}
        </div>
      )}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}

/* ---------------------------------------------------------------- Spinner */

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-ink-muted">
      <span
        className="w-3.5 h-3.5 rounded-full border-2 border-border border-t-accent animate-spin"
        aria-hidden="true"
      />
      <span>{label}</span>
    </span>
  )
}

/* ----------------------------------------------------------------- Layout */

export function Page({
  className, children, width = 'default',
}: {
  className?: string
  children: ReactNode
  width?: 'default' | 'wide' | 'narrow'
}) {
  const max =
    width === 'wide' ? 'max-w-[90rem]' : width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl'
  return (
    // A 16px side gutter at phone width, growing on larger screens.
    <div className={cx('mx-auto px-4 sm:px-6 lg:px-8 w-full', max, className)}>
      {children}
    </div>
  )
}

export function SectionHeading({
  title, subtitle, action, id,
}: { title: string; subtitle?: string; action?: ReactNode; id?: string }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <h2 id={id} className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
        {subtitle && <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------ Level */

const LEVEL_TONE = {
  beginner: 'positive',
  basic: 'positive',
  intermediate: 'caution',
  advanced: 'danger',
  expert: 'danger',
} as const

export function LevelBadge({ level }: { level: string }) {
  const tone = LEVEL_TONE[level as keyof typeof LEVEL_TONE] ?? 'neutral'
  return <Badge tone={tone}>{level}</Badge>
}
