/**
 * Contrast is asserted, not eyeballed.
 *
 * ARCHITECTURE.md claims every foreground/background pair meets WCAG AA. A claim like
 * that decays the moment someone nudges a colour, so it is a test. The token values are
 * read out of src/styles.css rather than duplicated here, so the test cannot pass against
 * a stale copy of the palette.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const CSS = readFileSync(path.join(process.cwd(), 'src', 'styles.css'), 'utf8')

/** Pull `--color-x: #hex` pairs out of a specific block of the stylesheet. */
function tokensIn(blockStart: string): Record<string, string> {
  const start = CSS.indexOf(blockStart)
  if (start === -1) throw new Error(`Could not find "${blockStart}" in styles.css`)
  // Read to the end of that declaration block.
  const end = CSS.indexOf('\n}', start)
  const block = CSS.slice(start, end === -1 ? undefined : end)
  const out: Record<string, string> = {}
  for (const match of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,8})/g)) {
    out[match[1] as string] = match[2] as string
  }
  return out
}

const light = tokensIn('@theme {')
const dark = tokensIn(':root[data-theme="dark"] {')

/* ---------------------------------------------------------------- maths */

function toRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

/** Relative luminance, per WCAG 2.1. */
function luminance(hex: string): number {
  const [r, g, b] = toRgb(hex).map((channel) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export function contrast(a: string, b: string): number {
  const la = luminance(a)
  const lb = luminance(b)
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la]
  return (lighter + 0.05) / (darker + 0.05)
}

/* ---------------------------------------------------------------- pairs */

/** [foreground, background, minimum ratio, what it is used for] */
const PAIRS: Array<[string, string, number, string]> = [
  // Body text and UI chrome: AA normal text needs 4.5:1.
  ['ink', 'canvas', 4.5, 'body text on the page'],
  ['ink', 'surface', 4.5, 'body text on a subtle surface'],
  ['ink', 'surface-raised', 4.5, 'body text on a card'],
  ['ink-muted', 'canvas', 4.5, 'secondary text'],
  ['ink-muted', 'surface', 4.5, 'secondary text on a surface'],
  ['ink-muted', 'surface-raised', 4.5, 'secondary text on a card'],

  // Hint text is small and supporting; AA large/incidental allows 3:1.
  ['ink-faint', 'canvas', 3, 'hint text'],
  ['ink-faint', 'surface', 3, 'hint text on a surface'],

  // Links and interactive accents carry meaning, so they need text contrast.
  ['accent', 'canvas', 4.5, 'links'],
  ['accent', 'surface', 4.5, 'links on a surface'],
  ['accent-ink', 'accent-soft', 4.5, 'text on an accent chip'],

  // Status colours must be readable on their own soft backgrounds.
  ['positive', 'positive-soft', 4.5, 'success text'],
  ['caution', 'caution-soft', 4.5, 'warning text'],
  ['danger', 'danger-soft', 4.5, 'error text'],
  ['positive', 'canvas', 4.5, 'success text on the page'],
  ['caution', 'canvas', 4.5, 'warning text on the page'],
  ['danger', 'canvas', 4.5, 'error text on the page'],

  // Pedagogical block headings on their own tinted backgrounds.
  ['why', 'why-soft', 4.5, 'WHY block heading'],
  ['internals', 'internals-soft', 4.5, 'UNDER THE HOOD block heading'],
  ['realworld', 'realworld-soft', 4.5, 'REAL WORLD block heading'],
  ['failure', 'failure-soft', 4.5, 'FAILURE block heading'],
  ['security', 'security-soft', 4.5, 'SECURITY block heading'],
  ['interview', 'interview-soft', 4.5, 'INTERVIEW block heading'],
  ['checkpoint', 'checkpoint-soft', 4.5, 'CHECKPOINT block heading'],
]

/**
 * WCAG 1.4.11 requires 3:1 for visual information needed to identify a control or its
 * state. `--color-border-strong` is that boundary — form fields, hover and focus states —
 * so it is held to 3:1.
 *
 * `--color-border` is deliberately *not* here. It groups and separates content (card
 * edges, table rules, dividers) where the boundary is decorative: removing it would not
 * make anything unidentifiable. Holding a divider to 3:1 would make every surface in the
 * app read as a heavy box, which is a real legibility cost for no accessibility gain.
 */
const BORDER_PAIRS: Array<[string, string, string]> = [
  ['border-strong', 'canvas', 'a control boundary on the page'],
  ['border-strong', 'surface', 'a control boundary on a surface'],
]

describe.each([
  ['light', light],
  ['dark', dark],
])('%s theme contrast', (themeName, tokens) => {
  it('defines every token the other theme defines', () => {
    const other = themeName === 'light' ? dark : light
    for (const key of Object.keys(other)) {
      expect(tokens[key], `${themeName} theme is missing --color-${key}`).toBeDefined()
    }
  })

  it.each(PAIRS)(
    '%s on %s reaches %s:1 — %s',
    (fg, bg, minimum, usage) => {
      const foreground = tokens[fg]
      const background = tokens[bg]
      expect(foreground, `--color-${fg} is not defined in the ${themeName} theme`).toBeDefined()
      expect(background, `--color-${bg} is not defined in the ${themeName} theme`).toBeDefined()

      const ratio = contrast(foreground as string, background as string)
      expect(
        ratio,
        `${usage}: --color-${fg} (${foreground}) on --color-${bg} (${background}) ` +
        `is ${ratio.toFixed(2)}:1 in the ${themeName} theme, below the required ${minimum}:1`,
      ).toBeGreaterThanOrEqual(minimum)
    },
  )

  it.each(BORDER_PAIRS)('%s on %s reaches 3:1 — %s', (fg, bg, usage) => {
    const ratio = contrast(tokens[fg] as string, tokens[bg] as string)
    expect(
      ratio,
      `${usage}: ${ratio.toFixed(2)}:1 in the ${themeName} theme, below 3:1`,
    ).toBeGreaterThanOrEqual(3)
  })
})

describe('contrast()', () => {
  it('returns 21 for black on white', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 1)
  })

  it('returns 1 for a colour against itself', () => {
    expect(contrast('#4338ca', '#4338ca')).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    expect(contrast('#123456', '#fedcba')).toBeCloseTo(contrast('#fedcba', '#123456'), 10)
  })

  it('handles three-digit hex', () => {
    expect(contrast('#000', '#fff')).toBeCloseTo(21, 1)
  })
})
