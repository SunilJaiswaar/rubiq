# Rubiq

**A free, open-source platform for learning software engineering — built so that a learner
never has to assemble a curriculum from thirty browser tabs again.**

Every lesson starts from the problem the technology was invented to solve, shows you the
mechanism, then shows you how it breaks. You read it, run it, get quizzed on it, and get
asked about it again a week later.

No account. No server. No tracking. Your progress lives in your browser and you can take
it with you.

```
┌──────────────────────────────────────────────────────────────────────┐
│  content/  (Markdown + YAML)                                         │
│      │                                                               │
│      │  npm run content:build                                         │
│      ▼                                                               │
│  src/generated/  (catalog, per-lesson JSON, search index, graph)      │
│      │                                                               │
│      ▼                                                               │
│  a static site — 127 KB of JavaScript on first load                   │
└──────────────────────────────────────────────────────────────────────┘
```

---

## What is actually here

This is an early release with a deliberately narrow curriculum and a complete platform.
The brief it was built against describes a curriculum of several hundred lessons; the
decision was to make three tracks genuinely excellent rather than thirty shallow ones,
because the engine is the reusable part and the content is the endless part.

| | |
|---|---|
| **Tracks** | 3 — Ruby, SQL & Databases, Data Structures & Algorithms |
| **Lessons** | 11, averaging ~16 minutes, all original writing |
| **Quizzes** | 11, with 68 questions across four question types |
| **Runnable exercises** | 2, with hidden edge-case tests |
| **Interview questions** | 32, with hints, model answers and follow-ups |
| **Roadmaps** | 3 — Backend (Ruby), SDE I, Mid → Senior |
| **Tests** | 272 unit and component, plus 54 browser checks against the built site |

### The features that are not in other tutorials

**Reading modes.** Every lesson marks its teaching moves with named blocks — `:::why`,
`:::internals`, `:::failure`, `:::interview`. The reading modes are *filters over that
structure*, so WHY mode shows you only the problem-and-motivation thread, UNDER THE HOOD
shows only the mechanism, FAILURE shows only what breaks. They cannot drift out of sync
with the lesson, because they are not separately written.

**You watch the index work.** The SQL track runs a real query engine in your browser over
100,000 rows and reports how many it had to examine. Toggle an index on a column, run the
*identical* query, and the number goes from 100,000 to 18. The plan is printed underneath.
It also tells you when an index did *not* help, because "an index is always faster" is
false and teaching it would be worse than teaching nothing.

**Failure is on the syllabus.** Every lesson has a `:::failure` block. What happens when
Redis dies, when a `NOT IN` meets a NULL, when a proc's `return` outlives its frame, when
a composite index's leading column is missing from the query.

**Nothing is reviewed once.** Quizzes feed a spaced-repetition queue keyed on *concepts*
rather than cards, so a review pulls a different question about the same idea each time.
Get something wrong and it comes back sooner.

**Answers are never free.** A quiz option's feedback appears after you commit. An interview
question makes you write an attempt before it reveals anything. An exercise's solution
stays locked until the tests pass or you have read every hint.

**Honest about what it cannot do.** JavaScript, TypeScript and SQL run in your browser.
Ruby, Python, Go and the rest do not, because that needs a sandboxed server this
deployment does not have — so those exercises show the problem, the tests and a reference
solution, and say plainly why the Run button is absent. There are no "coming soon" buttons
anywhere in this app.

---

## Run it

Requires **Node 22.12+**. `.nvmrc` pins Node 24 LTS, which is what CI runs — Node 20
reached end of life in April 2026 and its bundled npm has a peer-resolution bug that
crashes on some installs.

```bash
git clone https://github.com/SunilJaiswaar/rubiq
cd rubiq
npm install
npm run dev          # compiles content, then starts Vite on :5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Compile content and start the dev server |
| `npm run build` | Validate content → compile → type-check → build → size-budget check |
| `npm test` | 272 unit and component tests |
| `npm run test:smoke` | Drive real Chrome against the built site (needs `npm run preview` running) |
| `npm run build:pages` | Build for the GitHub Pages project path (`/rubiq/`) |
| `npm run preview:pages` | Preview that build — see the note below |
| `npm run lint` | ESLint, including the architecture layering rules |
| `npm run content:validate` | The content quality gate CI runs |
| `npm run typecheck` | TypeScript, strict, with `noUncheckedIndexedAccess` |

### Deploying

Enable **Settings → Pages → Source: GitHub Actions**, then push to `main`. The
[deploy workflow](.github/workflows/deploy.yml) handles the rest, including working out
whether the site is served from `/` or `/<repo>/` — so a fork needs no configuration
edited, no secrets set, and costs nothing.

For this repository that is `https://suniljaiswaar.github.io/rubiq/`.

**One footgun worth knowing.** A project-site build bakes `/rubiq/` into every asset URL,
and `vite preview` reads the base path from the same env var the build did. So previewing
a Pages build with a plain `npm run preview` serves the assets at `/` while the HTML asks
for them at `/rubiq/` — you get a blank page and 404s in the console, with nothing wrong
with the build. Use the matching pair:

```bash
npm run build:pages      # then
npm run preview:pages    # → http://localhost:4173/rubiq/
```

---

## Contributing a lesson

**A lesson is one Markdown file.** You do not need to run the app, understand React, or
write any TypeScript.

```
content/20-sql/10-reading-data/10-select-and-where/
├── lesson.md         prose + frontmatter          (required)
├── quiz.yml          questions                    (optional)
├── exercise.yml      starter, tests, solution     (optional)
└── playground.yml    tables to query              (optional)
```

The numeric prefixes set the order and are stripped from the URL, so inserting a lesson
never breaks saved progress or an inbound link.

[CONTENT_GUIDE.md](CONTENT_GUIDE.md) has the full format, every block name, and a worked
example you can copy. CI checks your submission for required blocks, misspelled block
names, dead internal links, quizzes with no correct answer, exercises with no tests, and
about a dozen other things — so you get told what is wrong in under a minute rather than
in review.

**The bar is understanding, not coverage.** A lesson should start from the problem, say
what the thing costs as well as what it buys, and say what happens when it breaks. If the
official docs already explain something well, link them and write about what they leave
out.

---

## How it is built

| | |
|---|---|
| **Frontend** | TypeScript (strict), React 19, Vite 7, Tailwind CSS 4, React Router 7 |
| **Content** | Markdown + YAML, compiled by a Node script into JSON |
| **Editor** | Monaco, bundled locally and lazy-loaded, with a working `<textarea>` fallback |
| **Execution** | Web Worker sandbox for JS/TS; a purpose-built SQL engine for the index demos |
| **Storage** | IndexedDB, falling back to localStorage, falling back to memory |
| **Search** | A build-time inverted index with BM25 scoring — no search dependency shipped |
| **Hosting** | Static files on GitHub Pages. No server, no database, no paid service. |

**Initial payload: 127 KB gzipped**, enforced by the build. Monaco is 831 KB and is
reached only by opening a playground. Lesson bodies are one lazy request each. The search
index is fetched the first time you search.

[ARCHITECTURE.md](ARCHITECTURE.md) explains the layering, why content is compiled rather
than parsed at runtime, and what the deliberate non-goals are.

### Why no backend

The project was built under a hard constraint: zero infrastructure budget. No server, no
domain, no paid anything. That turned out to be a useful constraint rather than only a
limitation — it forced a design where the learner's data is genuinely theirs, nothing is
tracked, and the whole thing works offline.

Every piece of persistence and execution sits behind an interface with swappable adapters,
so a Rails API can be added later as an adapter rather than a rewrite. The frontend will
keep working without it.

---

## Privacy

No analytics. No cookies. No third-party requests at runtime — not even a font CDN. No
account to create. Your progress, notes and bookmarks are in your browser's IndexedDB and
have never been sent anywhere, because there is nowhere to send them.

The export button on `/progress` gives you a JSON file containing literally everything the
app holds about you. Import merges, so moving between two browsers loses nothing.

---

## Documentation

| | |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | How it is put together, and why |
| [CONTENT_GUIDE.md](CONTENT_GUIDE.md) | Writing a lesson, with the full block vocabulary |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Workflow, review expectations, originality rules |
| [ROADMAP.md](ROADMAP.md) | The curriculum this is aiming at, and what is next |
| [SECURITY.md](SECURITY.md) | The sandbox model and how to report an issue |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | |
| [LICENSE](LICENSE) | MIT for code, CC BY-SA 4.0 for lesson content — see below |

## Licence

- **Code** — [MIT](LICENSE). Use it for anything.
- **Lesson content** (everything under `content/`) — [CC BY-SA 4.0](LICENSE-CONTENT).
  Share it, translate it, build on it; keep the attribution and keep derivatives equally
  free.

The split is deliberate. MIT on the code means a company can use the lesson engine
internally without friction. Share-alike on the content means nobody can take a thousand
hours of community-written explanations, put them behind a paywall, and not give anything
back. [CONTRIBUTING.md](CONTRIBUTING.md#licensing) explains the reasoning in full.

All explanations, examples and exercises here are original. Nothing is copied from a paid
course, a book, or another site — we link to primary documentation instead.
