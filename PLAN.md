# Plan — a Ruby/Rails-first path to Senior, Architect and AI Engineer

**Written for:** whoever decides what gets built next, and contributors picking up a track.
It is a design document, not marketing. Where something is undecided or infeasible it says so.

The commission is a free, self-paced platform that develops a working Ruby/Rails developer into
a **Senior/Staff engineer who can also architect systems and build AI/LLM features**. This
document is the planning layer the brief asks for before content generation: the roadmap, the
hierarchy, the dependency graph, the project arc, the reference mapping, the data model, the
platform and tutor architecture, and the capstone.

Two constraints shape every decision below and are not negotiable:

- **₹0 running cost.** Static hosting, GitHub Pages, no server, no database, no paid API in the
  critical path. This is why the data model section looks unusual.
- **No copyrighted reproduction.** Books are mapped as *further reading against concepts we
  explain in our own words*. No chapter reproductions, no copied exercises or diagrams, no
  long quotations. Every lesson is original writing; references point at the legitimate source.

---

## 0. Where this starts from

Not from zero. What exists today:

| | |
|---|---|
| Tracks | 13 |
| Lessons | 96, ~26 hours, original writing |
| Quizzes | 96, 661 questions |
| Interview questions | 257, with model answers and follow-ups |
| Platform | reading modes, SRS, roadmaps, concept graph, in-browser SQL engine, JS/TS sandbox, progress, export, PWA |
| Verification | 278 tests, 54 browser checks, 0 content warnings |

So this is a re-orientation and an extension, not a rebuild. The platform layer is largely done;
the content is Ruby-adjacent but not yet Ruby-*first*, and the AI arc does not exist.

### The honest gap analysis

Three things are wrong for this audience, measured rather than asserted:

| Problem | Evidence | Severity |
|---|---|---|
| Fundamentals teaches a Ruby audience in JavaScript | 75 JS code fences, 0 Ruby | High — it is the entry track |
| DSA teaches algorithms in JavaScript | 91 JS fences vs 27 Ruby | High — DSA is where a Rails dev is weakest |
| The only runnable exercises are JavaScript | 2 of 2 exercises | High — practice is not in their language |
| No OOP/SOLID or Design Patterns track | — | High — the highest-value material for a mid Rails dev |
| No AI/LLM/RAG arc | — | High — the distinctive ask |
| 2 exercises across 96 lessons | both now Ruby, both verified | Medium — the clearest imbalance overall |

### The scope reality

The brief lists 31 subject areas and 20 phases. Taught to the depth this platform already uses
(~16 minutes, every lesson answering what/why/mechanism/failure/trade-offs/interview), that is
**several thousand lessons** — years of writing. Any plan claiming otherwise is lying.

So the plan is ordered by **value to a Rails engineer per lesson written**, and each phase ships
complete and useful rather than everything arriving half-done. The sequencing below is the
actual deliverable of this document.

---

## 1. Learning roadmap — the phases, resequenced for this audience

The brief's twenty phases, reordered by what unblocks a Rails engineer soonest. Phases marked
**✅** are substantially done; **◐** partially; **○** not started.

### Part I — Make the existing material Ruby-first (foundation)

| Phase | Subject | State | Why here |
|---|---|---|---|
| 1 | Programming foundations, **in Ruby** | ◐ rewrite | Entry track currently in JS |
| 2 | Ruby — object model to GVL | ✅ | 11 lessons, already deep |
| 3 | **OOP + SOLID** | ○ | *The* highest-value gap for a mid Rails dev |
| 4 | **Design Patterns in Ruby and Rails** | ○ | Follows directly from phase 3 |
| 5 | Rails | ✅ | 13 lessons |
| 6 | SQL + PostgreSQL | ✅ | 9 lessons, in-browser engine |
| 7 | Testing | ✅ | 4 lessons; needs RSpec specifics |
| 8 | DSA, **in Ruby** | ✅ | 18 lessons, converted and verified |
| 9 | Git | ✅ | 5 lessons |

### Part II — Senior engineering

| Phase | Subject | State | Why here |
|---|---|---|---|
| 10 | HTTP & Networking | ✅ | 5 lessons |
| 11 | Operating Systems | ✅ | 4 lessons |
| 12 | System Design | ✅ | 6 lessons |
| 13 | **Distributed Systems** | ○ | Extends system design past one machine |
| 14 | Security | ✅ | 4 lessons |
| 15 | DevOps, Docker, **Linux**, **Cloud** | ◐ | 4 lessons; Linux and cloud missing |
| 16 | **Production engineering** | ○ | Incidents, on-call, capacity, cost |

### Part III — The AI arc (the distinctive track)

| Phase | Subject | State | Why here |
|---|---|---|---|
| 17 | **Python for Rubyists** | ○ | Framed as a translation, not a first language |
| 18 | **ML foundations** | ○ | Only what an engineer shipping AI needs |
| 19 | **Transformers & LLMs** | ○ | Tokens → attention → inference controls |
| 20 | **RAG & vector search** | ○ | pgvector, so it stays in Postgres |
| 21 | **AI Agents** | ○ | Tools, loops, failure modes |
| 22 | **AI Engineering for Rails** | ○ | **The flagship.** Production AI in a Rails app |

### Part IV — Frontend, for backend engineers

| Phase | Subject | State |
|---|---|---|
| 23 | JavaScript & TypeScript | ✅ 5 lessons |
| 24 | **HTML, CSS, layout** | ○ |
| 25 | **Hotwire / Turbo / Stimulus** | ○ — the Rails-native answer, before React |
| 26 | **Web performance** | ○ |

**Why the AI arc sits behind OOP/SOLID and patterns:** a developer who cannot structure a
service object will not ship a maintainable RAG pipeline. Phases 3–4 are prerequisites for
phase 22 in practice, not just on paper.

**Why Hotwire before React:** this is a Rails platform. Turbo is the default answer in a modern
Rails app, and teaching React first would be teaching the exception.

---

## 2. Course hierarchy

The existing structure already matches the brief's `Course → Module → Lesson` model, with files
as the source of truth:

```text
content/<NN>-<track>/            track.yml     → Course
  <NN>-<module>/                 module.yml    → Module
    <NN>-<lesson>/
      lesson.md                  frontmatter + pedagogical blocks
      quiz.yml                   → Quiz
      exercise.yml               → Exercise (optional)
      playground.yml             → sandbox seed (optional)
      project.yml                → Project (NEW — see §5)
```

A lesson's internal shape is already enforced by the content validator, and it maps onto the
brief's twelve-part lesson format:

| Brief asks for | Implemented as | Enforced? |
|---|---|---|
| What is it | `:::what` | required |
| Why does it matter | `:::why` + `:::problem` | required |
| Mental model | `:::analogy` | encouraged |
| Example / Code | `:::example`, fenced code | one required |
| Step-by-step | `:::how`, `:::internals` | one required |
| Common mistakes | `:::mistakes` | warned if absent |
| Exercise | `exercise.yml` with hidden tests | optional |
| Solution after attempt | solution gated on tests passing | implemented |
| Interview questions | `interview:` frontmatter, 3 levels | warned if absent |
| Real-world application | `:::realworld`, `:::production` | — |
| Next concept | `concepts:` + generated graph | derived |
| Trade-offs | `:::tradeoffs` | warned if absent |

This is the main reason new tracks cost Markdown rather than code: the framework the brief asks
for already exists and refuses lessons that skip the hard parts.

**The one addition needed:** `project.yml`, because the brief's project requirements
(architecture, ERD, APIs, scaling, failure scenarios) are structured data, not prose.

---

## 3. Skill dependency graph

Already generated from each lesson's `concepts:` and `prerequisites:` frontmatter, so it cannot
drift from the content. The spine for this audience:

```text
Ruby syntax ──▶ Objects ──▶ Method lookup ──▶ Blocks ──▶ Metaprogramming
                   │
                   ▼
              OOP ──▶ SOLID ──▶ Design Patterns ──▶ Architecture ──▶ System Design
                                      │                                   │
                                      ▼                                   ▼
                                    Rails ──▶ Multi-tenancy      Distributed Systems
                                      │
     SQL ──▶ Indexes ──▶ Query plans ─┤
              │                       ▼
              └──────────────▶ Transactions ──▶ Locking ──▶ Replication

Python ──▶ NumPy ──▶ ML ──▶ Neural nets ──▶ Transformers ──▶ LLMs
                                                               │
                              Embeddings ◀────────────────────┘
                                   │
            pgvector ◀─────────────┤
                                   ▼
                                 RAG ──▶ Agents ──▶ AI Engineering in Rails
```

Note `pgvector` deliberately joins the **SQL** spine, not a separate vector-database spine. For
a Rails engineer, vector search is a Postgres extension they already know how to operate — that
framing is worth more than teaching a new datastore.

When a learner fails a quiz, the graph already walks backwards to recommend the prerequisite
rather than repeating the lesson.

---

## 4. Recommended learning order

Three entry points, because "beginner to Staff" is not one audience:

**A. Mid Rails dev → Senior** (the primary audience)
`Ruby internals → OOP/SOLID → Design Patterns → SQL depth → Testing/RSpec → System Design → Distributed Systems → Production engineering`

**B. Rails dev → AI engineer** (the distinctive path)
`Python for Rubyists → ML foundations → Transformers/LLMs → RAG → Agents → AI Engineering for Rails`
*Gated on OOP/SOLID,* because the failure mode of AI features is unmaintainable glue code.

**C. Junior → employable**
`Fundamentals (Ruby) → Ruby → Git → SQL → Rails → Testing → HTTP → DSA → first three projects`

The roadmap engine already computes these with gap analysis and a weekly plan sized to available
hours, ordered by prerequisite depth before gap size.

---

## 5. Project roadmap

Currently the weakest area: **2 runnable exercises and 0 projects across 96 lessons.** The brief
is right to push here — this is the biggest single gap.

Projects are specified as data (`project.yml`) so the platform can track task-level progress:

```yaml
id: url-shortener
level: beginner
stack: [rails, postgresql]
teaches: [routing, migrations, indexes, caching]
requirements: { functional: [...], non_functional: [...] }
architecture: { diagram: "...", decisions: [...] }
schema: { tables: [...] }   # ERD, as data
api: [...]
milestones:                 # each independently checkable
  - id: redirect-works
    checks: [...]
failure_scenarios: [...]    # "the cache is empty", "two users claim one slug"
```

### The arc

| Level | Projects | Teaches |
|---|---|---|
| Beginner | Todo, Blog, **URL shortener**, Expense tracker, Notes | CRUD, migrations, indexes, auth basics |
| Intermediate | E-commerce backend, CRM, Helpdesk, **Booking system**, Notifications, Chat | Jobs, caching, state machines, concurrency |
| Advanced | Multi-tenant SaaS, Payments, Search, Job platform, Analytics | Tenancy, idempotency, pgvector, queues at scale |
| Senior | Large CRM, BookMyShow-style booking, Food delivery, Real-time chat, Video pipeline, Search engine, Notification platform, **RAG knowledge system**, AI SaaS | Architecture under constraint |

**Booking systems get the overbooking problem** (the transactions and locking material made
concrete). **URL shorteners get the hot-key problem.** Each project exists to make specific
lessons consequential, not as busywork.

---

## 6. Book and reference mapping

**The rule:** books are *further reading*, mapped to concepts we explain ourselves. We never
reproduce text, exercises, diagrams or solutions. Where a free, authoritative source exists, it
is preferred over a book.

| Our track | Primary further reading | Why |
|---|---|---|
| Ruby | *The Well-Grounded Rubyist*, *Ruby Under a Microscope*, *Metaprogramming Ruby* | Object model and internals |
| OOP/SOLID | *Practical Object-Oriented Design in Ruby*, *99 Bottles of OOP* | Ruby-native design reasoning |
| Design Patterns | *Design Patterns in Ruby*, GoF, *Refactoring* | Ruby idiom differs from the GoF Java |
| Rails | *Agile Web Development with Rails*, *Rails AntiPatterns*, *Growing Rails Applications* | Growth and anti-patterns age well |
| SQL | *SQL Performance Explained*, *The Art of PostgreSQL*, *Database Internals* | Index and planner reasoning |
| System Design | *Designing Data-Intensive Applications*, *Release It!*, *Fundamentals of Software Architecture* | DDIA is the spine |
| Distributed | DDIA, *Site Reliability Engineering* | |
| DSA | *Grokking Algorithms* (intuition), *The Algorithm Design Manual* (judgement), CLRS (reference) | Three different jobs |
| Testing | *Everyday Rails Testing with RSpec*, *Growing Object-Oriented Software* | |
| Python | *Fluent Python*, *Effective Python* | For an experienced dev |
| ML | *Hands-On Machine Learning*, *Designing Machine Learning Systems* | Engineering over theory |
| LLM | *Build a Large Language Model From Scratch*, *NLP with Transformers*, *AI Engineering* | |

**Rails version note:** we teach what transfers. Where Rails 4→7 genuinely diverges (Zeitwerk,
`load_defaults`, Hotwire replacing Turbolinks, `ActiveRecord::Enum` syntax), the lesson names
the version boundary explicitly rather than pretending one answer holds. Older books remain
useful for architecture and misleading for APIs; lessons say which.

**For fast-moving subjects — LLM APIs, RAG, agents, cloud — official documentation wins over
any book,** and lessons link there rather than citing a text that will be wrong within a year.

---

## 7. Free resource mapping

Every lesson's `resources:` frontmatter already carries links. Priority order, enforced by
convention:

1. Official docs — Ruby, Rails Guides, PostgreSQL, Python, MDN
2. Openly licensed material — *Operating Systems: Three Easy Pieces*, *The Rust Book* style
3. University courses — MIT OpenCourseWare, Stanford CS
4. Primary sources — arXiv, Papers with Code, RFCs
5. Reputable free tutorials — freeCodeCamp, Hugging Face course
6. Source code — reading Rails, Sidekiq, pgvector

Never: pirated books, scraped course content, unauthorised mirrors.

A link checker in CI is a known gap (see §15).

---

## 8. Content data model

The brief asks for `User`, `Course`, `Lesson`, `UserProgress`, `RevisionItem` and so on. **There
is no server and no database**, by design — the ₹0 constraint. So the model is split:

### Content entities → files, compiled at build time

| Brief entity | Here |
|---|---|
| Course, Module, Lesson, Topic | `track.yml`, `module.yml`, `lesson.md` |
| Concept, Prerequisite, Skill | `concepts:`/`prerequisites:` frontmatter → generated graph |
| Exercise, Question, Quiz | `exercise.yml`, `quiz.yml` |
| Project, ProjectTask | `project.yml` (to add) |
| Resource, Book | `resources:` frontmatter |
| LearningPath | `roadmaps.json` |

Compiled to `src/generated/` — catalog eager, everything else lazy. Content is reviewable in
pull requests and diffable, which a database row is not.

### Learner entities → the learner's own browser

| Brief entity | Here |
|---|---|
| User | no account; the browser *is* the identity |
| UserProgress, UserAnswer, UserSkill | IndexedDB via the `Store` interface |
| RevisionItem | SRS state, keyed on **concepts** rather than cards |
| Badge, Achievement | derived from progress, not stored |

Storage degrades IndexedDB → localStorage → memory. Full JSON export/import, so the learner
owns their data and no privacy policy is required because nothing leaves the device.

### If a backend is ever added

The shape it would take — deliberately not built yet, because nothing currently needs it:

```text
users ──< user_progress >── lessons        # lessons still from files, not rows
users ──< user_answers >── questions
users ──< revision_items >── concepts
users ──< project_submissions >── projects
users ──< sessions
```

The honest trigger for building it is **cross-device sync or cohort features**, not tidiness.
Until one of those is a real requirement, a server is a cost and a liability with no benefit.

---

## 9. Platform architecture

Unchanged and working; recorded here because the plan depends on it.

```text
content/ (Markdown + YAML)
    │  scripts/validate-content.mjs   ← refuses incomplete lessons
    ▼  scripts/build-content.mjs
src/generated/ (catalog eager; lessons, search index, graph lazy)
    │
    ▼
React + Vite ──▶ static site on GitHub Pages
    │
    ├── engines/   pure logic: quiz, progress, SRS, roadmap, search (BM25)
    ├── runners/   sandboxed execution behind one interface
    └── storage/   IndexedDB → localStorage → memory
```

Layering is enforced by ESLint `no-restricted-imports`: `engines/`, `runners/` and `storage/`
may not import React or anything from `features/`, `routes/` or `ui/`. An unenforced boundary is
a comment.

**Modular monolith, deliberately.** The brief says not to reach for microservices, and nothing
here needs one.

### Code execution — and the Ruby decision

Current: JS/TS in a Web Worker from a Blob URL (opaque origin, dangerous globals deleted, hard
4 s timeout, host terminates); SQL in a purpose-built engine reporting rows examined and a query
plan. **Nothing executes on the server, because there is no server** — which satisfies the
brief's sandboxing requirement structurally rather than by policy.

Ruby was registered as `UnavailableRunner` with an honest explanation. That is the gap that
makes this platform Ruby-adjacent rather than Ruby-first, and it is now resolved. Measured:

| build | gzipped | boot | stdlib |
|---|---|---|---|
| `ruby.wasm` | 4.7 MB | 347 ms | no — `require 'set'` fails |
| `ruby+stdlib.wasm` | 8.5 MB | 1.27 s | yes |

**Decision: `ruby+stdlib.wasm`.** The extra 3.8 MB and ~900 ms buys `set`, `json` and the rest.
Graph algorithms need `Set`, and a learner hitting `LoadError` on `require 'set'` experiences a
broken platform, which §63 forbids. It is lazily loaded, cached after first use, and behind a
loading state — so the cost is paid once, by learners who opened a Ruby exercise.

Verified working: CRuby 3.4.1, `Data.define`, `Struct`, `Comparable`, `define_method`,
`FrozenError`, stdout capture, 5 000-deep recursion.

The initial-payload budget (180 KB) is unaffected and measured: still 145.6 KB, because the
budget covers the eager bundle and this is lazy. The build already reports lazy chunks
separately, so the 8.9 MB asset is visible rather than hidden.

---

## 10. AI tutor architecture

**The hard constraint: the platform must work completely without AI.** The original brief is
explicit that the core experience cannot depend on a paid API, and that holds — a learner with
no key must lose nothing essential.

So the tutor is an **optional enhancement, bring-your-own-key**:

```text
Learner asks a question
   │
   ├── NO KEY (default) ──▶ retrieval over local content:
   │                        BM25 + the concept graph answer
   │                        "which lesson covers this", "what is the
   │                        prerequisite you are missing", "here is the
   │                        passage". No network, no cost, works offline.
   │
   └── KEY PRESENT ──────▶ the same retrieval, then the passages plus
                            the learner's progress as context to the
                            model, called DIRECTLY from the browser to
                            the provider. The key is stored locally and
                            never transits our infrastructure — because
                            we have none.
```

Teaching behaviour, not answer-dispensing: `hint → stronger hint → concept → example →
solution`, revealed on request. The learner's weak concepts come from the existing SRS and quiz
data, so the tutor knows what they have struggled with without any server-side profile.

**This is itself a worked RAG system** — retrieval over the lesson corpus, with citations back
to lessons. The AI track can use the platform's own tutor as its case study, which is a better
teaching artefact than a toy.

---

## 11–14. Progress, revision, exercise and interview systems

All four exist. Recorded with what each still needs.

**Progress (§11).** Completion is *earned*: a lesson with a quiz is incomplete until the quiz
passes. Per-concept accuracy, evidence-based weak areas, streaks that count only real work,
focused time that pauses on hidden tabs. *Needs:* project milestone tracking.

**Revision (§12).** Modified SM-2 keyed on **concepts, not cards**, so reviewing "indexes"
draws on every lesson teaching it. A lapse halves the interval rather than resetting it, because
resetting punishes a single bad day. Schedule approximates the brief's 1/3/7/14/30/60 days.
*Needs:* nothing structural.

**Exercises (§13).** `exercise.yml` with starter code, progressive hints, hidden edge-case tests,
and a solution gated on passing. *Needs:* **Ruby**, and far more of them — 2 across 96 lessons.

**Interviews (§14).** 257 questions, three levels, progressive reveal
(attempt → hint → answer → follow-ups), one-at-a-time simulation. *Needs:* the brief's
production-incident and debugging categories.

### New modes the brief asks for

| Mode | Status | Note |
|---|---|---|
| Learn, Practice, Interview, Revision | ✅ | |
| **Debug** | ○ | Broken Ruby/Rails/SQL + "what is wrong" → hints → root cause. Reuses the exercise runner; the diff is content shape. |
| **Architecture** | ○ | Guided design: requirements → estimation → API → schema → scaling → failure. Must *not* reveal the answer first. |
| **Project** | ○ | Needs `project.yml` and milestone tracking. |
| **Challenge** | ○ | Timed. Cheap once exercises exist. |
| **Difficulty engine** | ○ | Adaptive from quiz/exercise history. The data is already collected. |

Debug Mode is the best value of these: it is the same runner with different content, and
diagnosing broken code is the skill interviews actually test.

---

## 15. Final capstone

**AI-Powered Multi-Tenant SaaS** — deliberately the union of the whole curriculum, so no phase
is skippable:

```text
Rails ── PostgreSQL + pgvector ── Redis ── Sidekiq
  │
  ├── multi-tenancy (row-level security)     ← Security + SQL
  ├── RBAC, audit logs                        ← Security
  ├── background ingestion, embeddings        ← DevOps + AI
  ├── retrieval → rerank → LLM, cited         ← RAG
  ├── caching, query optimisation             ← SQL + System Design
  └── Docker, CI/CD, observability            ← DevOps
```

Deliverables are documents as much as code — requirements, architecture diagram, ERD, API docs,
security model, scaling strategy, test strategy, deployment and monitoring plan, AI/RAG
architecture, cost analysis, failure scenarios, demo. A Staff engineer is assessed on written
reasoning, so the capstone assesses that.

**Completion is not "lessons read".** It requires lessons + exercises + quizzes + project + final
assessment; advanced tracks add an architecture review, a production scenario and an interview
simulation.

---

## Sequencing — what actually happens next

Ordered by value per lesson written, each step shipping something complete.

| # | Work | Why first |
|---|---|---|
| 1 | ~~**Ruby runner** (`ruby+stdlib.wasm`)~~ ✅ | Done. Real CRuby 3.4 in the browser, 4 browser checks, playground defaults to Ruby. |
| 2 | ~~**Rewrite DSA in Ruby**~~ ✅ | Done. All 15 lessons + both exercises; 0 JS fences left in the track. Every snippet verified against ruby 3.4.5 first — 432 assertions (354 across the trees/graphs/sorting/DP/tries/retry files, 57 for the arrays and linear-structures lessons, 21 evaluating each exercise's declared tests against its declared solution). This caught 9 wrong claims in the existing content — see below. |
| 3 | **Rewrite Fundamentals in Ruby** ← next | Entry track; keep the cross-language comparisons, which are genuinely valuable |
| 4 | **Ruby exercises throughout** | 2 across 96 lessons is the clearest imbalance in the platform |
| 5 | **OOP + SOLID track** | Highest-value new content for a mid Rails dev |
| 6 | **Design Patterns in Ruby/Rails** | Follows 5; each pattern with the Rails-native idiom |
| 7 | **Debug Mode** | Same runner, new content shape; high value per unit of work |
| 8 | **Projects + `project.yml`** | Converts reading into building |
| 9 | **Python for Rubyists → ML → LLM → RAG → Agents** | The AI arc, in dependency order |
| 10 | **AI Engineering for Rails** | The flagship; depends on everything above |
| 11 | Distributed systems · Linux · Cloud · Hotwire · Production engineering | Fill remaining phases |
| 12 | Architecture Mode · difficulty engine · AI tutor · link checker | Platform work, once content justifies it |

### What verify-before-ship caught in the DSA rewrite

Running every snippet before writing it found nine claims in the existing content that were
wrong, not merely JavaScript-flavoured. Recorded because it is the argument for keeping the
workflow on every later track.

| Claim as written | What measurement showed |
|---|---|
| "median-of-three, moved to hi as the pivot" | Ordering the three leaves the **maximum** at hi. Exactly n²/2 comparisons on sorted input — 7,998,000 vs 39,917 at n=4,000 |
| Median-of-three protects quicksort | Does nothing for duplicates. 20k values / 10 distinct: 20,085,244 vs 59,645, a 337× gap. Three-way partitioning costs ~5% on distinct input |
| `0.1 + 0.2 < 0.3` is true | False in both languages — the sum is 0.30000000000000004, which is *greater* |
| `twoSum([7, 2, 24, 11], 9)` returns null | Returns `[0, 1]`, the correct answer |
| Sorted insertion into a BST is silently slow | In Ruby the recursive insert raises `SystemStackError` at ~9,400 values — it crashes during construction |
| A boolean comparator silently stops ordering | Ruby raises `NoMethodError`. A **Float** comparator is the silent one, and an inconsistent `<=>` is silent in both |
| `Array#shift` is O(n), so queues are quadratic | O(1) in MRI. The real quadratic is `Array#include?` in a loop — 143× slower than `Set` at 8k |
| Bellman-Ford arbitrage check (`< 0`) | Reports arbitrage on an exactly-fair market: the round trip sums to −6.9e−17. Needs an epsilon |
| `findWords` board search | Was a stub — built the trie, returned an empty set, described the algorithm in a comment |

Two further corrections were to advice rather than fact: "use the language's sorted map" is
advice a Rubyist cannot take (no ordered map, no heap, no priority queue; `SortedSet` left the
stdlib in 3.0), and the blocks exercise claimed it had to be JavaScript "where it runs in your
browser", which stopped being true when ruby.wasm shipped.

Known gaps recorded honestly: pre-rendered lesson HTML for crawlers (deep links return a 404
status with correct SPA body), lazy-chunk size reporting, a resource link checker, and four
`set-state-in-effect` lint suppressions pending Suspense adoption.

---

## The rule this is all measured against

Not "cover 31 subjects" or "finish 150 books". The test is whether someone finishing this can:

> read, write, debug, test, design, optimise, scale and secure a real production system — build
> AI features on top of it — and explain every decision to a room.

Anything that does not move a learner toward that is cut, however impressive it looks on a
landing page.
