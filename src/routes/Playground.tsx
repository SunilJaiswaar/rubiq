/**
 * A free-form playground.
 *
 * Unavailable languages are listed honestly, with the reason, rather than hidden or
 * offered as dead buttons (brief §63).
 */
import { useCallback, useMemo, useState } from 'react'
import { getRunner, RUNNABLE_LANGUAGES } from '@/runners'
import type { Language, RunResult } from '@/runners/types'
import { CodeEditor } from '@/features/CodeEditor'
import { RunPanel } from '@/features/RunPanel'
import { SqlConsole } from '@/features/SqlConsole'
import { Page, Card, Button, Badge, cx } from '@/ui/primitives'
import type { Playground as PlaygroundData } from '@/content/types'

const STARTERS: Partial<Record<Language, string>> = {
  ruby: `# Real CRuby 3.4, compiled to WebAssembly, running in this tab.
# The first run downloads and starts the runtime, so it takes a moment.
# Every run after that gets a fresh VM in about 400ms — fresh, so nothing
# you define here leaks into the next run.

Point = Data.define(:x, :y) do
  def distance_to(other)
    Math.hypot(x - other.x, y - other.y)
  end
end

puts Point.new(x: 0, y: 0).distance_to(Point.new(x: 3, y: 4))

# Enumerable, the object model and the standard library are all here.
require 'set'
puts [3, 1, 2, 1].to_set.sort.inspect

# Gems are not — there is no bundler in a browser tab.
`,
  javascript: `// Anything you like. Cmd/Ctrl+Enter runs it.

function fib(n) {
  const out = [0, 1];
  while (out.length < n) {
    out.push(out.at(-1) + out.at(-2));
  }
  return out.slice(0, n);
}

console.log(fib(12));

// The sandbox is a Web Worker with no DOM and no network.
// An infinite loop is terminated after 4 seconds rather than hanging the tab.
`,
  typescript: `// TypeScript is parsed properly (via Sucrase), not regex-stripped.

interface Point {
  x: number;
  y: number;
}

const distance = (a: Point, b: Point): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

console.log(distance({ x: 0, y: 0 }, { x: 3, y: 4 }));

enum Direction { Up, Down }
console.log(Direction.Up, Direction[1]);
`,
}

/** A generic dataset for the free-form SQL console. */
const SQL_PLAYGROUND: PlaygroundData = {
  language: 'sql',
  notes:
    'A small sample schema. Click any column to toggle an index on it and compare "rows examined" before and after.',
  starter: `SELECT c.name, COUNT(o.id) AS orders, COALESCE(SUM(o.total), 0) AS spent
FROM customers c
LEFT JOIN orders o ON o.customer_id = c.id
GROUP BY c.name
ORDER BY spent DESC;`,
  indexes: {},
  seed: {
    tables: [
      {
        name: 'customers',
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'name', type: 'text' },
          { name: 'city', type: 'text' },
          { name: 'tier', type: 'text' },
        ],
        rows: [
          [1, 'Asha', 'Pune', 'gold'],
          [2, 'Bo', 'Pune', 'silver'],
          [3, 'Cal', 'Delhi', 'gold'],
          [4, 'Dee', 'Kochi', 'bronze'],
          [5, 'Eli', 'Delhi', 'silver'],
          [6, 'Fay', null, 'bronze'],
        ],
      },
      {
        name: 'orders',
        columns: [
          { name: 'id', type: 'integer' },
          { name: 'customer_id', type: 'integer' },
          { name: 'total', type: 'integer' },
          { name: 'status', type: 'text' },
        ],
        rows: [
          [101, 1, 500, 'shipped'],
          [102, 1, 250, 'pending'],
          [103, 3, 900, 'shipped'],
          [104, 3, 150, 'cancelled'],
          [105, 5, 400, 'shipped'],
        ],
      },
    ],
  },
}

export default function Playground() {
  const [language, setLanguage] = useState<Language>('ruby')
  const [code, setCode] = useState(STARTERS.ruby ?? '')
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)

  const runner = useMemo(() => getRunner(language), [language])

  const run = useCallback(async () => {
    setRunning(true)
    try {
      setResult(await runner.run(code))
    } finally {
      setRunning(false)
    }
  }, [runner, code])

  const pick = (next: Language) => {
    setLanguage(next)
    setCode(STARTERS[next] ?? '')
    setResult(null)
  }

  const unavailable = (['python', 'go', 'java', 'cpp', 'csharp', 'php', 'rust'] as Language[])

  return (
    <Page className="py-10">
      <header className="max-w-2xl mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Playground
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          Scratch space. Code runs entirely in your browser, in a sandboxed worker with no
          network and no DOM — nothing you type here leaves your machine.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-1.5" role="tablist" aria-label="Language">
        {RUNNABLE_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            role="tab"
            aria-selected={language === lang}
            onClick={() => pick(lang)}
            className={cx(
              'text-sm px-3 py-1.5 rounded-lg border transition-colors',
              language === lang
                ? 'border-accent bg-accent-soft text-accent-ink font-medium'
                : 'border-border text-ink-muted hover:border-border-strong',
            )}
          >
            {getRunner(lang).label}
          </button>
        ))}
      </div>

      {language === 'sql' ? (
        <SqlConsole playground={SQL_PLAYGROUND} />
      ) : (
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2">
            <Badge tone="accent">{runner.label}</Badge>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setCode(''); setResult(null) }}>
                Clear
              </Button>
              <Button size="sm" variant="primary" onClick={() => void run()} disabled={running}>
                {running ? 'Running…' : 'Run ▸'}
              </Button>
            </div>
          </div>

          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
            height={420}
            onRun={() => void run()}
            ariaLabel={`${runner.label} playground`}
          />

          <div className="border-t border-border bg-surface/50">
            <RunPanel result={result} running={running} />
          </div>
        </Card>
      )}

      {/* The honest account of what is not here. */}
      <Card className="mt-8 p-5">
        <h2 className="text-sm font-semibold text-ink">
          Not runnable in a browser (yet)
        </h2>
        <p className="mt-2 text-sm text-ink-muted leading-relaxed max-w-2xl">
          These need a sandboxed server, which this deployment does not have — it is static
          files on GitHub Pages with no origin to run code on. The{' '}
          <code className="font-mono text-xs">CodeRunner</code> interface they would plug
          into already exists, so adding execution is one adapter rather than a rewrite.
          Until then, their exercises still show the problem, the tests and a reference
          solution.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {unavailable.map((lang) => (
            <Badge key={lang}>{getRunner(lang).label}</Badge>
          ))}
        </div>
      </Card>
    </Page>
  )
}
