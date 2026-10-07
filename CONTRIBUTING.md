# Contributing

The most valuable contribution is usually the smallest one: **you spotted something wrong
in a lesson and you fixed it.** Everything below is for larger changes.

## The fast paths

| You want to | Do this |
|---|---|
| Fix a factual error | Open a PR editing the lesson, or an issue if you are unsure |
| Fix a typo | PR straight to `main`'s content file. No issue needed. |
| Add a lesson | Read [CONTENT_GUIDE.md](CONTENT_GUIDE.md), then PR |
| Request a lesson | Open an issue labelled `content`. Say who it is for and what they get stuck on. |
| Change the application | Open an issue first — see [Code changes](#code-changes) |
| Report a security issue | See [SECURITY.md](SECURITY.md). Do not open a public issue. |

Every lesson page links directly to its own source file on GitHub. If you are reading
something wrong, the fix is two clicks away.

---

## Content changes

```bash
npm install
npm run content:validate     # the same gate CI runs
npm run dev                  # see it rendered
```

A lesson is one Markdown file in `content/`. You do not need to understand the
application. [CONTENT_GUIDE.md](CONTENT_GUIDE.md) is the full reference.

### What gets a lesson merged

The quality bar is in [CONTENT_GUIDE.md §10](CONTENT_GUIDE.md#10-the-bar). The short
version: start from the problem, say what it costs, say what breaks, and make sure every
example really runs.

### What gets a lesson rejected

- **Copied text.** From a paid course, a book, Stack Overflow, another learning site, or
  anywhere else. Every explanation here must be your own writing. Link to primary
  documentation instead of paraphrasing it closely.
- **LLM output pasted in unedited.** Use whatever tools you like to draft, but you are
  signing your name to the technical claims. Unverified generated text is the fastest way
  to get confidently wrong content into a curriculum, and it reads like it.
- **A restatement of the official docs.** If the docs say it well, link them and write
  about what they leave out — the failure modes, the trade-offs, the thing that only
  becomes obvious in production.
- **Benchmarks you did not run.**
- **A wall of prose.** Break it with examples, a checkpoint and a quiz.

### Review

Content PRs get checked for technical accuracy, whether a beginner could follow it, and
whether the examples run. Expect questions. A lesson that gets three rounds of review is
normal and is how the bar is maintained — it is not a judgement on you.

---

## Code changes

**Open an issue before writing a large change.** Not bureaucracy — the architecture has
specific constraints (see below) and it is a waste of your evening to find out at review
time that a design was ruled out for a reason.

```bash
npm install
npm run dev
npm test                 # 264 unit and component tests
npm run lint             # includes the architecture layering rules
npx tsc -b               # strict, with noUncheckedIndexedAccess
npm run build            # enforces the initial-payload budget
```

### Constraints that are not negotiable without a discussion

1. **It must work with no server.** Static files on GitHub Pages, zero infrastructure
   cost. If a feature needs a backend, it needs to degrade to something honest when the
   backend is absent.
2. **The core experience must not depend on a paid API.** An optional AI tutor is welcome.
   A platform that stops teaching when someone's API key runs out is not.
3. **Content must stay separate from application code.** A contributor adds a Markdown
   file. If your change makes them touch TypeScript, it is the wrong change.
4. **No "coming soon".** A feature either works or is absent. An unavailable language
   says why it is unavailable; it does not show a dead button.
5. **The initial payload budget is 180 KB gzipped**, enforced by `scripts/postbuild.mjs`.
   It is currently 127 KB. If your change needs a large dependency, it must be lazy.
6. **Privacy.** No analytics, no third-party runtime requests, no tracking. Not even a
   font CDN.
7. **The layering holds.** `engines/`, `runners/` and `storage/` import no React and
   nothing from `features/`, `routes/` or `ui/`. `ui/` knows nothing about lessons or
   progress. ESLint enforces both — see `eslint.config.js`.

[ARCHITECTURE.md](ARCHITECTURE.md) explains why each of these is there.

### Tests

New logic needs tests. The existing suite is a reasonable guide to the expected level:
the SQL engine has 43, the quiz grader 22, spaced repetition 12. Tests here describe
*behaviour that matters* — "a stored proc's return raises LocalJumpError", "an index on a
tiny table reports that it did not help" — rather than restating the implementation.

If you change anything a learner interacts with, add a check to `scripts/smoke.mjs`,
which drives real Chrome against the built site.

---

## Licensing

By contributing you agree your work is licensed as follows:

- **Code** — [MIT](LICENSE)
- **Lesson content** (anything under `content/`) — [CC BY-SA 4.0](LICENSE-CONTENT)

**Why the split.** MIT on the code means a company can use the lesson engine internally
with no friction, which is good for the project — more users, more contributors, more bug
reports. Share-alike on the content means nobody can take a thousand hours of
community-written explanations, put them behind a paywall, and give nothing back. The code
is infrastructure and should spread freely; the curriculum is a commons and should stay
one.

If you are contributing content you wrote elsewhere, you need the right to relicense it.
If you are contributing on behalf of an employer, make sure they are fine with it.

---

## Code of conduct

[CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). In short: this project exists to help people
learn, including people who are at the very beginning. Condescension toward beginners is
the one thing most directly opposed to the point of the project.
