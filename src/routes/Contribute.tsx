import { Link } from 'react-router-dom'
import { totals, blockSpecs } from '@/content/catalog'
import { Page, Card, Badge, SectionHeading } from '@/ui/primitives'

const REPO = 'https://github.com/SunilJaiswaar/rubiq'

const LESSON_TEMPLATE = `---
title: Connection pooling
summary: Why opening a connection per request falls over, and what a pool actually guarantees.
level: intermediate
minutes: 15
version: "16"
status: draft
last_reviewed: "2026-10-07"
tags: [databases, performance]
concepts: [connection-pooling, resource-limits]
prerequisites: [select, where]
interview:
  - question: Why does a web app need a connection pool?
    level: intermediate
    hint: How long does opening a TCP connection and authenticating take?
    answer: >-
      Opening a database connection costs a TCP handshake, TLS, and
      authentication — milliseconds each time, and the server allocates
      a backend process per connection...
    followUps:
      - "What happens when the pool is exhausted?"
resources:
  - title: "PostgreSQL docs — Connections"
    url: https://www.postgresql.org/docs/current/runtime-config-connection.html
---

## Start from the problem

Every request opens a connection, runs one query, and closes it...

:::problem
Opening a connection is not free...
:::

:::what
A connection pool keeps a fixed set of open connections...
:::

:::why
Because the expensive part — handshake, TLS, auth — happens once...
:::

:::failure
When every connection is checked out, the next request waits...
:::

:::interview
A strong answer separates the cost of *creating* a connection from the
cost of *holding* one...
:::
`

export default function Contribute() {
  return (
    <Page width="narrow" className="py-10">
      <header className="mb-10">
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Contribute
        </h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          A lesson is one Markdown file in <code>content/</code>. You do not need to
          understand the application, run it, or write any TypeScript — add the file, open
          a pull request, and CI checks the rest.
        </p>
      </header>

      <section className="mb-10">
        <SectionHeading title="How content is laid out" />
        <Card className="p-5">
          <pre className="font-mono text-xs leading-relaxed overflow-x-auto text-ink-muted">
{`content/
  20-sql/                           ← a track
    track.yml                       title, description, prerequisites
    10-reading-data/                ← a module
      module.yml                    title, summary, level
      10-select-and-where/          ← a lesson
        lesson.md                   prose + frontmatter      (required)
        quiz.yml                    questions                (optional)
        exercise.yml                code exercise + tests    (optional)
        playground.yml              SQL tables to query      (optional)`}
          </pre>
          <p className="mt-4 text-sm text-ink-muted leading-relaxed">
            The numeric prefixes set the order and are stripped from the URL, so
            renumbering to insert a lesson does not break saved progress or inbound
            links. A lesson's stable identity is{' '}
            <code className="text-xs">track/module/lesson</code>.
          </p>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading
          title="The block vocabulary"
          subtitle="This is the part that makes the lessons different from a tutorial"
        />
        <Card className="p-5">
          <p className="text-sm text-ink-muted leading-relaxed">
            Teaching moves are marked with named containers rather than left as prose, so
            the reading modes (WHY, UNDER THE HOOD, REAL WORLD, FAILURE, INTERVIEW) are
            filters over real structure and can never drift from the lesson:
          </p>
          <pre className="mt-3 p-3 bg-surface border border-border rounded-lg font-mono text-xs overflow-x-auto">
{`:::why
Before Redis, every page view re-ran the same expensive query...
:::

:::failure
When Redis dies and you have no fallback, every request
stampedes the database at once.
:::`}
          </pre>

          <h3 className="mt-5 text-xs font-bold uppercase tracking-wide text-ink-muted mb-2">
            Every block name
          </h3>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
            {Object.entries(blockSpecs).map(([name, spec]) => (
              <div key={name} className="flex items-baseline gap-2 text-xs">
                <code className="font-mono text-accent shrink-0">:::{name}</code>
                <span className="text-ink-muted">{spec.summary || spec.label}</span>
              </div>
            ))}
          </div>

          <p className="mt-5 text-sm text-ink-muted leading-relaxed">
            CI requires <code>:::what</code> and <code>:::why</code>, plus at least one of{' '}
            <code>:::example</code>, <code>:::how</code> or <code>:::realworld</code>. It
            warns — but does not block — if <code>:::tradeoffs</code>,{' '}
            <code>:::mistakes</code>, <code>:::interview</code> or{' '}
            <code>:::checkpoint</code> are missing. A misspelled block name is an error,
            because an unknown container renders as plain prose and the author never sees
            their block vanish.
          </p>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading title="A lesson, start to finish" />
        <Card className="overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
            <Badge tone="accent">lesson.md</Badge>
            <span className="text-xs text-ink-faint">copy this and edit it</span>
          </div>
          <pre className="p-4 font-mono text-[0.6875rem] leading-relaxed overflow-x-auto max-h-96 text-ink-muted">
            <code>{LESSON_TEMPLATE}</code>
          </pre>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading title="What CI checks" />
        <Card className="p-5">
          <ul className="space-y-2 text-sm text-ink-muted">
            {[
              'Frontmatter is present and has title and summary; level and status use known values',
              'Required pedagogical blocks are there, and no block name is misspelled',
              'Lesson ids are unique, and internal links resolve to a page that exists',
              'Quizzes: every question has a prompt, choice questions have exactly one correct option, multi questions have at least one, recall questions have key points',
              'Exercises: starter code, a reference solution, and at least one test with an expected value',
              'SQL playgrounds: seed rows match their column count, and declared indexes name real columns',
              'last_reviewed is a valid date, and lessons older than a year are flagged as possibly stale',
              'The whole application still type-checks, tests pass, and the production build succeeds',
            ].map((item) => (
              <li key={item} className="flex gap-2.5 leading-relaxed">
                <span className="text-positive shrink-0 mt-0.5" aria-hidden="true">✓</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-muted leading-relaxed">
            Run the same checks locally with{' '}
            <code className="text-xs">npm run content:validate</code>. Warnings are
            suggestions; errors block the merge.
          </p>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading
          title="The bar for a lesson"
          subtitle="Quantity is not the goal. This is."
        />
        <Card className="p-5">
          <ul className="space-y-3 text-sm">
            {[
              ['Can a beginner follow it?', 'No unexplained jargon. When a term is unavoidable, introduce it, define it plainly, then use it.'],
              ['Would an experienced engineer learn something?', 'Usually from the internals, the failure modes, or the trade-offs — the parts tutorials skip.'],
              ['Does it start from the problem?', 'Never open with a definition. Open with what hurt before this existed.'],
              ['Is every claim checkable?', 'Code examples must actually run and produce the output shown. Benchmarks must be reproducible.'],
              ['Does it say what it costs?', 'Every technology trades something away. A lesson that only lists benefits is marketing.'],
              ['Does it say what breaks?', 'What happens at 3am when this fails is often the most valuable paragraph on the page.'],
            ].map(([question, answer]) => (
              <li key={question}>
                <p className="font-medium text-ink">{question}</p>
                <p className="text-ink-muted mt-0.5 leading-relaxed">{answer}</p>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mb-10">
        <SectionHeading title="Please do not" />
        <Card className="p-5">
          <ul className="space-y-2 text-sm text-ink-muted">
            {[
              'Copy text or exercises from a paid course, a book, or another site. Every explanation here must be original. Link to primary documentation instead.',
              'Add a lesson that only restates the official docs. If the docs already say it well, link them and explain what the docs leave out.',
              'Write a 5,000-word wall of prose with no interaction. Break it with examples, checkpoints and a quiz.',
              'Claim a benchmark you have not run.',
            ].map((item) => (
              <li key={item} className="flex gap-2.5 leading-relaxed">
                <span className="text-danger shrink-0 mt-0.5" aria-hidden="true">✕</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section>
        <SectionHeading title="Start here" />
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { label: 'Fix an error you spotted', href: `${REPO}/issues/new?labels=content`, detail: 'The fastest useful contribution' },
            { label: 'Add a lesson', href: `${REPO}/blob/main/CONTENT_GUIDE.md`, detail: 'The full authoring guide' },
            { label: 'Read the architecture', href: `${REPO}/blob/main/ARCHITECTURE.md`, detail: 'If you want to change the app' },
            { label: 'See what is planned', href: `${REPO}/blob/main/ROADMAP.md`, detail: 'The curriculum this is aiming at' },
          ].map((item) => (
            <Card key={item.label} className="p-4 hover:border-border-strong transition-colors">
              <a href={item.href} target="_blank" rel="noopener noreferrer" className="block">
                <p className="text-sm font-medium text-ink">{item.label} ↗</p>
                <p className="text-xs text-ink-muted mt-0.5">{item.detail}</p>
              </a>
            </Card>
          ))}
        </div>

        <p className="mt-6 text-sm text-ink-muted leading-relaxed">
          There are {totals.lessons} lessons here and the curriculum in{' '}
          <a href={`${REPO}/blob/main/ROADMAP.md`} target="_blank" rel="noopener noreferrer" className="text-accent underline">
            ROADMAP.md
          </a>{' '}
          runs to several hundred. The gap is the opportunity. If you have ever explained
          something to a colleague and watched it land, that explanation belongs here —
          see the <Link to="/learn" className="text-accent underline">existing lessons</Link>{' '}
          for the tone.
        </p>
      </section>
    </Page>
  )
}
