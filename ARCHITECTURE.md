# Architecture

> Rubiq is a **static-first, content-as-data** learning platform. The application is a
> compiler and a reader; the curriculum is data. Nothing about the first release
> requires a server, a database, or a paid service.

---

## 1. Constraints that shaped every decision

| Constraint | Consequence |
|---|---|
| ₹0 infrastructure budget | No origin server. Output is static files on GitHub Pages. |
| Learner code must never run on our host | All execution is client-side, in a sandboxed Web Worker. |
| Content must be contributable without touching app code | Content is Markdown + YAML in `/content`, compiled by a build script. |
| Must survive growing to thousands of lessons | Lesson bodies are separate lazy-loaded chunks; only an index is eager. |
| A Rails backend may arrive later | All persistence and execution sit behind interfaces with swappable adapters. |
| Privacy is a feature | No analytics, no cookies, no network calls at runtime. Progress is local. |

The single most important structural rule:

```
content/  →  (build script)  →  src/generated/  →  app reads generated data
```

The app **never** reads `content/` directly, and content **never** imports from `src/`.
This is what lets a contributor add a lesson with one Markdown file and no TypeScript.

---

## 2. Layers

```
┌───────────────────────────────────────────────────────────────┐
│  content/            Markdown + YAML. The curriculum.          │
│                      Owned by educators & contributors.        │
└───────────────────────────┬───────────────────────────────────┘
                            │  scripts/build-content.mjs
                            │  scripts/validate-content.mjs  (CI gate)
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  src/generated/      catalog.json      (eager, small)          │
│                      search-index.json (lazy)                  │
│                      lessons/<id>.json (lazy, one per lesson)   │
│                      graph.json        (lazy)                   │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
┌───────────────────────────────────────────────────────────────┐
│  src/content/        Typed accessors over generated data.      │
│                      The only module that knows file layout.   │
├───────────────────────────────────────────────────────────────┤
│  src/engines/        Pure logic, no React, fully unit-tested.  │
│                      progress · quiz · search · srs · roadmap  │
├───────────────────────────────────────────────────────────────┤
│  src/runners/        CodeRunner interface + adapters.          │
│                      js/ts (worker) · sql (worker) · remote    │
├───────────────────────────────────────────────────────────────┤
│  src/storage/        Store interface. IndexedDB adapter,       │
│                      localStorage fallback, memory for tests.  │
├───────────────────────────────────────────────────────────────┤
│  src/ui/             Design system primitives. No app logic.   │
├───────────────────────────────────────────────────────────────┤
│  src/features/       Feature components composing the above.   │
├───────────────────────────────────────────────────────────────┤
│  src/routes/         Pages, one per URL. Lazy-loaded.          │
└───────────────────────────────────────────────────────────────┘
```

A module may only import from layers **below** it. `engines/` importing React, or
`ui/` importing `engines/`, is an architecture violation.

**This is enforced, not documented.** `eslint.config.js` carries `no-restricted-imports`
rules for both directions, with error messages that say what to do instead. A layering
claim that is only written down decays on the first busy afternoon.

---

## 3. Why a build step instead of runtime Markdown parsing

Parsing Markdown in the browser would have been less code. We compile instead because:

1. **CI can reject broken content.** Frontmatter schema, dead internal links,
   duplicate lesson IDs, and malformed quizzes fail the build *before* deploy (§53 of the brief).
2. **Search needs an inverted index.** Building it at runtime would mean shipping and
   parsing every lesson body on first load.
3. **Code splitting.** One JSON per lesson means the reader downloads one lesson,
   not the curriculum.
4. **Markdown is rendered to HTML once, at build time.** The browser never runs a
   Markdown parser, and the sanitisation decision is made in one place.

The cost is a build step contributors must run (`npm run dev` does it automatically).

---

## 4. Content model

```
content/
  <track>/                       e.g. ruby, dsa, sql
    track.yml                    title, description, difficulty, prerequisites
    <NN>-<module-slug>/
      module.yml                 title, summary, level
      <NN>-<lesson-slug>/
        lesson.md                prose + frontmatter metadata
        quiz.yml                 optional — questions
        exercise.yml             optional — code exercise with tests
```

Stable lesson identity is `<track>/<module>/<lesson>` derived from directory names with
the numeric ordering prefix stripped. Renumbering a directory to reorder lessons therefore
does **not** break saved progress or inbound links. This is deliberate.

### Pedagogical blocks

The brief requires every lesson to answer 19 questions (What / Why / Internals /
Trade-offs / Failure / Interview / …). Rather than enforce that with headings prose can
drift from, lessons mark them with **named containers**:

```markdown
:::why
Before Redis, every page view re-ran the same expensive query...
:::

:::internals
`GET` is O(1) because the keyspace is a hash table...
:::

:::failure
When Redis dies and you have no fallback, every request stampedes the database.
:::
```

These compile to semantic HTML with a `data-block` attribute. That single decision
delivers four of the brief's "modes" for free:

- **WHY mode** (§68) filters the view to `why` / `problem` / `history` blocks
- **UNDER THE HOOD mode** (§69) filters to `internals`
- **REAL WORLD mode** (§70) filters to `realworld` / `production`
- **FAILURE mode** (§71) filters to `failure` / `mistakes` / `debugging`

The modes are not separate hand-written content. They are views over structured content,
so they can never fall out of sync — and the content validator can tell an author
*which* required block their lesson is missing.

### Required vs. optional blocks

`validate-content.mjs` enforces that every lesson declares `what`, `why`, and at least one
of `example`/`realworld`. Blocks like `security` are warned about, not errored, so that
a contributor is nudged rather than blocked.

---

## 5. Persistence

```ts
interface Store {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
  keys(prefix?: string): Promise<string[]>
}
```

Adapters, selected in this order at boot:

1. `IndexedDbStore` — primary. Handles large data (notes, attempt history).
2. `LocalStorageStore` — fallback for private-mode / blocked-storage browsers.
3. `MemoryStore` — tests, and last-resort so the app never crashes on a storage error.

Every read is wrapped: a storage failure degrades the app to read-only, never a blank page.

**Export / import** (§60) is a first-class feature, not a nicety: `progress.json`
round-trips the entire store. Lock-in would contradict the project's reason to exist.

### Future backend

`SyncingStore` will wrap the local store and reconcile against a Rails API. Because every
caller already awaits a `Store`, adding sync requires no change to engines or components.
The domain model in §57 of the brief maps 1:1 onto the keys this store already writes.

---

## 6. Code execution

```ts
interface CodeRunner {
  readonly language: Language
  readonly availability: 'local' | 'remote' | 'unavailable'
  run(source: string, opts: RunOptions): Promise<RunResult>
}
```

| Language | Adapter | How |
|---|---|---|
| JavaScript | `JsRunner` | Web Worker from a Blob URL; no DOM, no network, timeout-killed |
| TypeScript | `JsRunner` | Same worker, after a real Sucrase transform (see below) |
| SQL | `SqlRunner` | Purpose-built in-memory engine that reports its own cost |
| Ruby, Python, Go, … | `UnavailableRunner` | Says why it cannot run, rather than offering a dead button |

**TypeScript is parsed, not regex-stripped.** The tempting shortcut is to delete type
annotations with regular expressions. It is a trap: a regex cannot distinguish `: T` from
an object-literal value or a ternary's colon, so it silently corrupts working code and the
learner gets a baffling error in something they wrote correctly. Sucrase is a real parser
at a fraction of `tsc`'s size, loaded only when someone actually runs TypeScript. Type
*checking* is Monaco's job, via the language service already in the editor — so: honest
type errors while writing, correct execution when running.

The playground UI is written against the interface and renders an honest
"not runnable in your browser yet" state for `unavailable` languages — rather than a fake
button, which §63 of the brief forbids.

**Security.** Workers are created from a blob URL with no network access, are terminated
after a hard timeout, and cannot touch `window`, the DOM, or storage. Learner code never
reaches a server, because there is no server.

---

## 7. Search

A build-time inverted index: token → posting list of `{ lessonId, field, tf }`, where
`field` is weighted (`title` 8, `headings` 4, `tags` 3, `body` 1). Query time does
tokenisation, prefix expansion for the final term, then BM25-ish scoring. Natural-language
queries work because stopwords are dropped, so *"why does Redis use memory?"* scores on
`redis` and `memory`.

No search dependency is shipped. The index for the current curriculum is tens of KB
gzipped and is fetched lazily on first search.

---

## 8. Routing & SEO

Routes are flat and human-meaningful (§76): `/learn/ruby/blocks`, `/sql/joins`,
`/dsa/binary-search`. GitHub Pages has no server-side rewrites, so the SPA fallback is the
standard `404.html` copy of `index.html`; `scripts/postbuild.mjs` also emits a `sitemap.xml`
and per-route metadata. Pre-rendering real HTML per lesson is the next step for crawlability
and is tracked in ROADMAP.md — the content pipeline already has everything it needs for it.

---

## 9. Accessibility & performance budget

- Semantic landmarks, skip link, visible focus rings, `aria-current` on navigation.
- Keyboard: `/` focuses search, `?` opens shortcuts, full tab-order through quizzes.
- `prefers-reduced-motion` disables every transition.
- Colour pairs are contrast-checked in both themes by `src/ui/theme.test.ts`, which reads
  the tokens out of `src/styles.css` rather than duplicating them — so the test cannot
  pass against a stale copy of the palette. Text pairs are held to 4.5:1 and control
  boundaries to 3:1 (WCAG 1.4.11). A decorative divider is deliberately exempt, with the
  reasoning in the test.
- Budget: initial payload ≤ 180 KB gzipped, **enforced by `scripts/postbuild.mjs`** —
  the build fails if it regresses. Currently 127 KB (98 KB of that is React).
- Monaco is 831 KB gzipped and is reached only by opening a playground or an exercise;
  it is also bundled locally rather than from a CDN, so offline use works and no third
  party learns which lessons a visitor opens. Route chunks, lesson bodies, the search
  index and the concept graph are all lazy.
- One lesson's playground seeds 100,000 rows. The *generator spec* is shipped (~400 bytes)
  and expanded in the browser; shipping the expanded rows would have been 4.8 MB for a
  single lesson. `src/runners/seed.mjs` is shared by the build and the runtime so the two
  cannot diverge.

---

## 10. How these claims are checked

Every structural claim in this document is verified by something that runs in CI, because
an architecture document that is only prose becomes fiction within a month.

| Claim | Checked by |
|---|---|
| Content is valid and complete | `scripts/validate-content.mjs` — required blocks, misspelled block names, duplicate ids, dead links, malformed quizzes and exercises, seed arity, staleness |
| Engines are pure and layering holds | `eslint.config.js` — `no-restricted-imports` in both directions |
| Scheduling, grading, search and SQL are correct | 272 unit and component tests |
| Contrast meets WCAG in both themes | `src/ui/theme.test.ts`, reading the real tokens |
| The initial payload stays under budget | `scripts/postbuild.mjs`, which exits non-zero |
| The app actually works | `scripts/smoke.mjs` — 54 checks driving real Chrome against the built site: lessons render, modes filter, the sandbox executes, the index demo takes rows examined from 100,000 to 18, progress reaches IndexedDB, dark mode and a 375px viewport both hold, `/` opens search, and no uncaught exception occurs anywhere in the run |

The smoke test is the one worth highlighting. The central claim of the SQL track is that a
learner can *see* an index change the cost of a query; that claim is asserted against a
real browser on every build.

---

## 11. Deliberate non-goals for v1

- No user accounts, no server, no AI dependency in the core path (§43).
- No gamification that rewards clicking over understanding (§40, §61).
- No "coming soon" placeholders (§63). A feature either works or is absent.
- No scraped third-party course content (§78). Explanations here are original.
