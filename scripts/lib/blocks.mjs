/**
 * The pedagogical block vocabulary.
 *
 * Every lesson marks its teaching moves with named containers (`:::why ... :::`).
 * This file is the single source of truth for which blocks exist, how they are
 * labelled in the UI, and which "learning modes" they belong to.
 *
 * Adding a block here is all that is needed to make it usable in content,
 * validated by CI, and filterable by a mode.
 */

/** @typedef {{ label: string, icon: string, tone: string, summary: string }} BlockSpec */

/** @type {Record<string, BlockSpec>} */
export const BLOCKS = {
  // --- Orientation: what are we even looking at ---
  what:        { label: 'What it is',        icon: 'dot',      tone: 'neutral', summary: 'Plain definition' },
  why:         { label: 'Why it exists',     icon: 'spark',    tone: 'why',     summary: 'The motivation' },
  problem:     { label: 'The problem',       icon: 'target',   tone: 'why',     summary: 'What hurt before this existed' },
  history:     { label: 'Before this',       icon: 'clock',    tone: 'why',     summary: 'The older approach and its limits' },
  analogy:     { label: 'An analogy',        icon: 'bulb',     tone: 'neutral', summary: 'Everyday comparison' },

  // --- Mechanism ---
  how:         { label: 'How it works',      icon: 'gear',     tone: 'neutral', summary: 'The mechanism' },
  internals:   { label: 'Under the hood',    icon: 'layers',   tone: 'internals', summary: 'What actually happens one level down' },

  // --- Application ---
  example:     { label: 'Example',           icon: 'code',     tone: 'neutral', summary: 'Smallest useful demonstration' },
  realworld:   { label: 'In the real world', icon: 'globe',    tone: 'realworld', summary: 'How this looks in production code' },
  production:  { label: 'In production',     icon: 'server',   tone: 'realworld', summary: 'Operating it for real' },

  // --- Judgement ---
  tradeoffs:   { label: 'Trade-offs',        icon: 'scale',    tone: 'neutral', summary: 'What you give up' },
  alternatives:{ label: 'Alternatives',      icon: 'fork',     tone: 'neutral', summary: 'Other ways to solve this' },

  // --- Things going wrong ---
  mistakes:    { label: 'Common mistakes',   icon: 'warn',     tone: 'failure', summary: 'What beginners get wrong' },
  failure:     { label: 'When it breaks',    icon: 'bolt',     tone: 'failure', summary: 'Failure modes and blast radius' },
  debugging:   { label: 'How to debug it',   icon: 'search',   tone: 'failure', summary: 'Diagnosing it in the wild' },

  // --- Engineering concerns ---
  security:    { label: 'Security',          icon: 'shield',   tone: 'security', summary: 'How this gets exploited' },
  performance: { label: 'Performance',       icon: 'gauge',    tone: 'neutral', summary: 'Cost and how to measure it' },
  testing:     { label: 'Testing',           icon: 'check',    tone: 'neutral', summary: 'How to prove it works' },

  // --- Retention ---
  interview:   { label: 'In an interview',   icon: 'chat',     tone: 'interview', summary: 'How this is asked, and what a strong answer sounds like' },
  checkpoint:  { label: 'Checkpoint',        icon: 'flag',     tone: 'checkpoint', summary: 'Answer before moving on' },
  practice:    { label: 'Practice',          icon: 'pencil',   tone: 'checkpoint', summary: 'Do it yourself' },
  build:       { label: 'Build it',          icon: 'hammer',   tone: 'checkpoint', summary: 'Apply it in a project' },

  // --- Inline asides ---
  note:        { label: 'Note',              icon: 'info',     tone: 'neutral', summary: '' },
  warning:     { label: 'Careful',           icon: 'warn',     tone: 'failure', summary: '' },
  jargon:      { label: 'Jargon decoded',    icon: 'book',     tone: 'neutral', summary: 'A term, in plain language' },
}

export const BLOCK_NAMES = Object.keys(BLOCKS)

/**
 * Learning modes (brief §68-§72). A mode is a *filter over blocks*, never
 * separately authored content — so a mode can never drift from the lesson.
 */
export const MODES = {
  full:       { label: 'Full lesson', blurb: 'Everything, in teaching order.', blocks: null },
  why:        { label: 'Why',         blurb: 'The problem, the old way, and why it was not enough.', blocks: ['problem', 'history', 'why', 'analogy'] },
  internals:  { label: 'Under the hood', blurb: 'What happens one layer down.', blocks: ['internals', 'how'] },
  realworld:  { label: 'Real world',  blurb: 'How this is actually used and operated.', blocks: ['realworld', 'production', 'example'] },
  failure:    { label: 'Failure',     blurb: 'How it breaks, and how you find out.', blocks: ['failure', 'mistakes', 'debugging'] },
  interview:  { label: 'Interview',   blurb: 'What gets asked, and what a strong answer sounds like.', blocks: ['interview'] },
}

export const MODE_NAMES = Object.keys(MODES)

/** Blocks a lesson must have to pass validation. */
export const REQUIRED_BLOCKS = ['what', 'why']
/** At least one of these must be present. */
export const REQUIRED_ONE_OF = [['example', 'realworld', 'how']]
/** Missing these produces a warning, not an error. */
export const ENCOURAGED_BLOCKS = ['tradeoffs', 'mistakes', 'interview', 'checkpoint']
