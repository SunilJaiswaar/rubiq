# Roadmap

This file is honest about the gap between what exists and what the project is for.

**What exists:** a complete platform and 96 lessons across 13 tracks — fundamentals, Ruby,
Rails, Git, SQL, DSA, JavaScript/TypeScript, HTTP, operating systems, system design,
security, testing and DevOps.
**What it is for:** taking someone from zero to a capable professional engineer.

The curriculum now covers that arc. What remains is depth in places, more runnable
practice, and the platform work listed below.

---

## How the curriculum was built

One vertical slice first — Ruby, SQL and algorithms — because those three exercise every
feature the platform has: prose, diagrams, runnable exercises with hidden tests, an
interactive query engine with cost reporting, quizzes of four kinds, interview questions,
and a concept graph with real prerequisite edges. Only once the engine was proven against
real content did the remaining ten tracks follow, each of which cost Markdown rather than
code.

The brief this was built against ends with: *optimise for how deeply the learner
understands, not for how many courses you have.* So every lesson answers the same
questions — what this is, what problem it solves, how it works one level down, how it
breaks, what the trade-offs are, and what a strong interview answer sounds like — and the
validator refuses a lesson that skips them.

---

## Shipped

- **Content pipeline** — Markdown + YAML compiled to JSON, with a CI quality gate that
  checks required blocks, misspelled block names, dead links, malformed quizzes and
  exercises, seed-row arity, and staleness.
- **Lesson reader** — build-time-rendered prose, pedagogical blocks, table of contents,
  per-lesson notes and bookmarks, reading-time estimates, version and last-reviewed
  metadata, direct edit links.
- **Reading modes** — WHY · UNDER THE HOOD · REAL WORLD · FAILURE · INTERVIEW, as filters
  over real content structure.
- **Quiz engine** — single choice, multi-select with partial credit, ordering, and
  self-assessed free recall. Feedback only after committing. Options reshuffle on retake.
- **Spaced repetition** — modified SM-2 over *concepts* rather than cards, so a review
  pulls a different question about the same idea. Fills itself as the learner studies.
- **Code sandbox** — Web Worker with network and DOM removed and a hard timeout. JS and
  TS (parsed properly with Sucrase, not regex-stripped). Error messages are explanations.
- **SQL engine** — SELECT, WHERE, JOIN/LEFT JOIN, GROUP BY, HAVING, aggregates, DISTINCT,
  ORDER BY, LIMIT, comment handling — and rows examined, index usage and a query plan.
- **Index demo** — 100,000 rows generated in the browser from a 400-byte spec. Toggle an
  index, re-run the identical query, watch 100,000 → 18. Says so when an index did *not*
  help.
- **Search** — build-time inverted index, BM25 with field weights, prefix expansion while
  typing, synonym folding (`js`→`javascript`, `n+1`→`nplusone`), and results that explain
  why they matched. No search dependency shipped.
- **Progress** — earned completion (a quiz lesson is not complete until the quiz passes),
  per-concept accuracy, evidence-based skill gaps, streaks that only count real work,
  focused-time tracking that pauses on hidden tabs, activity grid.
- **Roadmaps** — three role paths with gap analysis and a weekly plan sized to available
  time, ordered by prerequisite before gap size.
- **Interview mode** — progressive reveal (attempt → hint → answer → follow-ups) with a
  one-at-a-time simulation.
- **Concept graph** — prerequisites and dependents per concept, generated from frontmatter.
- **No lock-in** — full JSON export/import, notes exported as Markdown, one-click delete.
- **PWA** — installable, offline shell, offline lessons once read.
- **Accessibility** — contrast asserted by test in both themes, keyboard navigation
  throughout, focus trap in the command palette, `prefers-reduced-motion`, semantic
  landmarks, skip link.
- **Performance** — 146 KB gzipped initial payload, enforced by the build.

---

## Next

### 1. Content depth, now that the breadth exists

The thirteen tracks cover the arc from zero to professional. The gaps that remain are
depth rather than coverage:

- **More runnable practice.** Two exercises and four SQL playgrounds across 96 lessons is
  the clearest imbalance. Every DSA lesson should have an exercise with hidden edge-case
  tests; the engine for that already exists.
- **Distributed systems** as its own track — consensus, leader election, exactly-once
  semantics, the failure modes the system design track only gestures at.
- **Cloud and infrastructure as code** — the layer below the DevOps track.
- **AI engineering** — prompting, evaluation, retrieval, and the cost and latency
  trade-offs, taught the same way as everything else.
- **Deeper Rails** — Hotwire, Action Cable, the Rack-to-TCP internals walk.
- **Frontend** — React's rendering model and state, which the JavaScript track sets up
  and does not cover.

engineering · SRE.

### 2. Platform work, in order of value per hour

**Pre-rendered HTML per lesson.** The biggest single win available. The content pipeline
already holds everything needed; a lesson route becomes a real HTML file, which fixes
crawlability, makes the first paint instant, and makes the site readable with JavaScript
off. Currently the SPA serves a shell and `sitemap.xml` is the only concession to crawlers.

**Debugging lab.** The brief calls this a major differentiator and it is. Give the learner
a working-but-wrong program — an N+1 query, a missing index, a race condition, a leak, a
stale cache — and the tooling to find it. The SQL engine already reports enough to make
the query cases real; the worker sandbox can host the JavaScript ones.

**Scenario mode.** *"You have 10 million users and your API suddenly receives 50,000
requests per second. What breaks first?"* Progressive reveal, like interview mode, but over
a system rather than a question. Needs no new infrastructure.

**Projects.** Multi-step builds with milestones, tests and extension challenges. The
exercise runner handles single functions; projects need a file tree and a test harness
across files.

**More runnable languages.** Ruby via `ruby.wasm`, Python via Pyodide. Both are large
(10–30 MB) so they must be opt-in per lesson, not loaded speculatively. The `CodeRunner`
interface already accommodates them — this is an adapter, not a rewrite.

**Suspense for lesson and review loading.** Four effects currently clear state before
an async fetch — `Lesson`, `Review` and `SqlConsole` — each carrying an
`eslint-disable` for `react-hooks/set-state-in-effect` with the reason inline. They are
correct and the extra render is imperceptible, but the effect-free version is Suspense
over a resource cache, which would also give proper loading boundaries and remove the
hand-rolled `cancelled` flags. It is a change to how lesson data is loaded, not a local
tidy-up, which is why it is here rather than done.

**Content Security Policy.** Requires a host that can set headers. See
[SECURITY.md](SECURITY.md) for why a meta CSP was rejected rather than shipped as
reassurance.

**Pre-rendered lesson HTML would also fix the 404 status on deep links.** GitHub Pages
serves `404.html` for any unmatched path, so `/learn/ruby/blocks-and-yield` returns the
app shell with a 404 status. Browsers do not care — the router resolves the path and the
lesson renders, which the browser smoke test verifies against the live site. Crawlers do
care, so until lessons are real HTML files the sitemap is the only way they are found.

### 3. Deliberately not next

**An AI tutor in the core path.** An optional one is welcome and the interfaces leave room
for it. A platform that stops teaching when an API key expires is not the thing being
built.

**Accounts and cloud sync.** Everything is behind a `Store` interface, so a Rails backend
is an adapter. But "works with no account" is a feature, not a limitation, and the local
experience must stay complete.

**Certification.** Only worth building when there is enough assessed content for a
certificate to mean something. A certificate for watching content is noise.

**Gamification beyond what exists.** XP and badges are easy to add and pull in exactly the
wrong direction — the current streak only counts days you *completed* something, and that
is the right shape. Points that reward clicking would make the product worse.

---

## How to help

The highest-value contribution is a lesson in one of the gaps above, written to the bar in
[CONTENT_GUIDE.md](CONTENT_GUIDE.md). The second highest is finding something wrong in a
lesson that exists — every lesson page links to its own source file.

If you want to work on the platform, open an issue first; the constraints in
[CONTRIBUTING.md](CONTRIBUTING.md#constraints-that-are-not-negotiable-without-a-discussion)
rule out some designs for reasons that are not obvious from the code.
