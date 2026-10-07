# Security

## Reporting a vulnerability

**Do not open a public issue.** Use
[GitHub's private vulnerability reporting](https://github.com/SunilJaiswaar/rubiq/security/advisories/new)
on this repository.

Please include what you did, what happened, and what you expected. A proof of concept
helps. You will get an acknowledgement within a few days.

This is a volunteer project with no budget, so there is no bounty — but you will be
credited in the advisory unless you would rather not be.

---

## What the attack surface actually is

Being honest about this matters, because it determines what is worth reporting.

**There is no server.** The deployed application is static files on GitHub Pages. There is
no origin that executes anything, no database, no API, no session, no authentication. The
classes of vulnerability that normally dominate a web application's threat model — SQL
injection, SSRF, broken access control, insecure deserialisation on the server — have
nowhere to happen.

**There is no user data to breach.** No account is created and no personal data is
collected. Progress, notes and bookmarks live in the visitor's own browser (IndexedDB) and
are never transmitted. There is no outbound request at runtime to anywhere — not even a
font CDN.

So the real surface is: **can content or a code example do something to the visitor's
browser that it should not?**

---

## How that surface is handled

### Lesson content cannot inject markup

Markdown is rendered to HTML **once, at build time**, by `scripts/lib/markdown.mjs`, with
`html: false`. Raw HTML in a lesson is escaped, not passed through. There is no
Markdown parser in the shipped application at all, which means:

- A malicious pull request cannot smuggle a `<script>` into a lesson.
- The sanitisation decision is made in one reviewable place rather than per render.
- `dangerouslySetInnerHTML` in `LessonBody.tsx` receives only HTML that our own renderer
  produced. That is why it is defensible there and would not be anywhere else.

External links in content get `rel="noopener noreferrer"` automatically.

### Learner code runs in a sandbox, and only in their own browser

JavaScript and TypeScript exercises execute in a **Web Worker created from a Blob URL**.
That gives four layers of containment:

1. **Worker scope** — no `window`, no `document`, no DOM.
2. **Opaque origin** — because the worker is created from a Blob, same-origin `fetch` and
   storage are unavailable to it.
3. **Globals removed** — `fetch`, `XMLHttpRequest`, `WebSocket`, `importScripts`,
   `indexedDB`, `caches`, `Worker` and others are deleted before user code is evaluated.
4. **Hard timeout** — the host terminates the worker after 4 seconds, so an infinite loop
   cannot hang the tab.

**This is a teaching sandbox, not a security boundary against a determined attacker**, and
it does not need to be one: the code being run is the learner's own, it never leaves their
machine, and there is no server to attack. We would still like to know if the containment
can be escaped in a way that affects the *page* — reading another origin's data, stealing
the visitor's progress, or persisting across navigations.

### The SQL engine

`src/runners/sql-runner.ts` is a hand-written interpreter over in-memory arrays. It parses
and evaluates `SELECT` statements only; there is no `eval`, no code generation, and no
connection to any real database. Playground seed data is declared in YAML and expanded by
a fixed vocabulary of generators — content cannot supply code to run at seed time.

### Dependencies

- `npm audit --audit-level=moderate` runs in CI and currently reports **zero**
  vulnerabilities.
- Dependabot is configured for npm and GitHub Actions.
- All actions are pinned to major versions from verified publishers.
- No runtime dependency is loaded from a CDN. Monaco in particular is bundled locally
  rather than fetched from one, which also means offline use works and no third party
  learns which lessons a visitor opens.

### Content Security Policy

GitHub Pages cannot set response headers, so a CSP must be a `<meta>` tag — and a meta CSP
cannot use `frame-ancestors` or report-only mode. A policy strict enough to be worth having
also has to accommodate Monaco's workers and the Blob worker the sandbox depends on.

Rather than ship a CSP that looks reassuring and permits `unsafe-eval` anyway, the current
position is: no meta CSP, and the XSS surface closed at the source instead (build-time
rendering with raw HTML disabled, no runtime Markdown parser, no user-generated content
shared between visitors). A full CSP is tracked in
[ROADMAP.md](ROADMAP.md) for whenever the project has a host that can set headers.

If you think that trade is wrong, that is a good issue to open.

---

## Out of scope

- Missing security headers that GitHub Pages cannot set (HSTS, CSP via header,
  X-Frame-Options). We would need a different host.
- The absence of rate limiting or authentication. There is no server and no account.
- Causing the *learner's own* code to misbehave in their own sandbox — that is the
  playground working as intended.
- Reports from automated scanners with no demonstrated impact.

## In scope, and genuinely wanted

- Any way lesson content could execute script in a visitor's page.
- Any escape from the worker sandbox that touches the page, its storage, or another origin.
- Anything that causes progress data to leave the visitor's machine.
- A prototype-pollution or similar issue in the content pipeline that a pull request could
  exploit to affect the deployed site.
- A dependency with a known exploitable vulnerability that `npm audit` is missing.
