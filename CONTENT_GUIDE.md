# Writing a lesson

A lesson is one Markdown file. You do not need to run the application, understand React,
or write any TypeScript.

This guide is the full reference. If you want to start immediately: copy an existing
lesson directory, change the frontmatter, rewrite the body, open a pull request.

---

## 1. Where files go

```
content/
  20-sql/                                 ← track
    track.yml
    10-reading-data/                      ← module
      module.yml
      10-select-and-where/                ← lesson
        lesson.md                         prose + metadata        REQUIRED
        quiz.yml                          questions               optional
        exercise.yml                      code exercise + tests   optional
        playground.yml                    tables to query         optional
```

**Numeric prefixes set the order and are stripped from the URL.** `10-select-and-where`
becomes `/learn/sql/select-and-where`. A lesson's permanent identity is
`track/module/lesson` — so renumbering directories to insert a lesson in the middle does
**not** break saved progress or inbound links. Renaming a directory does. Think of the
slug as public API.

---

## 2. Frontmatter

```yaml
---
title: Blocks and yield                   # REQUIRED
summary: >-                               # REQUIRED — one or two sentences, shown in
  Why Ruby has a second, special way       #   the catalogue and in search results
  of passing a function.
level: basic                              # beginner | basic | intermediate | advanced | expert
minutes: 18                               # omit and it is estimated from word count
version: "3.3"                             # which version of the technology this describes
status: stable                            # draft | review | stable | deprecated
last_reviewed: "2026-09-20"                # flagged as possibly stale after a year
tags: [ruby, blocks, closures]             # free-form, used for search weighting
concepts: [blocks, yield, closures]        # IMPORTANT — see below
prerequisites: [method-lookup]             # concepts (or lesson ids) assumed by this lesson

interview:                                 # optional, one entry per question
  - question: What is a block in Ruby?
    level: basic
    hint: How many blocks can a method take?
    answer: >-
      A block is a chunk of code attached to a method call...
    followUps:
      - "Why does Ruby special-case one block rather than passing a lambda?"
    realWorld: >-
      The same pattern appears in transactions, mutexes and connection pools.

resources:                                 # optional — primary sources only
  - title: "Ruby documentation — Proc"
    url: https://docs.ruby-lang.org/en/master/Proc.html
---
```

### `concepts` is the load-bearing field

`concepts` is not a tag list. It drives three systems:

1. **The spaced-repetition queue.** Opening a lesson enrols its concepts for review, so
   the learner gets re-asked about them days later.
2. **The concept map** at `/graph`, which shows prerequisites and dependents.
3. **Weak-area detection.** Quiz questions tag a `concept:`, and repeated misses on that
   concept mark it as a weakness on the progress page.

Use short, stable, kebab-case names, and reuse the ones that already exist (`/graph` lists
them all). A lesson with no concepts is invisible to all three systems — CI warns about it.

---

## 3. The block vocabulary

This is what makes these lessons different from a tutorial, and the part worth getting right.

Teaching moves are marked with **named containers** rather than left as undifferentiated
prose:

```markdown
:::why
Before Redis, every page view re-ran the same expensive query against the database,
even though the answer had not changed.
:::

:::failure
When Redis dies and the application has no fallback, every request that would have hit
the cache hits the database at once. The database is sized for cache-miss traffic, not
for all of it.
:::
```

Why bother: the reading modes (WHY, UNDER THE HOOD, REAL WORLD, FAILURE, INTERVIEW) are
**filters over these blocks**. They are not separately written content, so they can never
drift out of sync with the lesson — and the validator can tell you which required block
your lesson is missing.

### Every block

**Orientation**

| Block | For |
|---|---|
| `:::what` | The plain definition. **Required.** |
| `:::why` | Why this exists at all. **Required.** |
| `:::problem` | What hurt before it existed |
| `:::history` | The older approach and why it was not enough |
| `:::analogy` | An everyday comparison |

**Mechanism**

| Block | For |
|---|---|
| `:::how` | The mechanism, at the level the learner needs |
| `:::internals` | What happens one layer down. Powers UNDER THE HOOD mode. |

**Application**

| Block | For |
|---|---|
| `:::example` | The smallest useful demonstration |
| `:::realworld` | What this looks like in production code |
| `:::production` | Operating it for real |

**Judgement**

| Block | For |
|---|---|
| `:::tradeoffs` | What you give up. A lesson with only benefits is marketing. |
| `:::alternatives` | Other ways to solve the same problem |

**Things going wrong**

| Block | For |
|---|---|
| `:::mistakes` | What beginners get wrong, and why it is tempting |
| `:::failure` | Failure modes and blast radius. Powers FAILURE mode. |
| `:::debugging` | How you actually diagnose it |

**Engineering concerns**

| Block | For |
|---|---|
| `:::security` | How this gets exploited |
| `:::performance` | What it costs and how to measure it |
| `:::testing` | How to prove it works |

**Retention**

| Block | For |
|---|---|
| `:::interview` | How it gets asked and what a strong answer sounds like |
| `:::checkpoint` | A question to answer before moving on |
| `:::practice` | Do it yourself |
| `:::build` | Apply it in a project |

**Asides**

| Block | For |
|---|---|
| `:::note` · `:::warning` · `:::jargon` | Short interruptions. `jargon` is for decoding a term. |

### What CI requires

- **Errors** (block the merge): `:::what` and `:::why` must both be present, plus at least
  one of `:::example`, `:::how` or `:::realworld`.
- **Warnings** (nudges): `:::tradeoffs`, `:::mistakes`, `:::interview`, `:::checkpoint`.
- **A misspelled block name is an error.** `:::internal` is not a block, and markdown-it
  would silently render it as a paragraph — so the author would never notice their block
  had vanished. CI catches it.

### Custom titles

```markdown
:::jargon Closure
A function bundled with the variable bindings from where it was defined.
:::
```

---

## 4. Code

````markdown
```ruby
# A plain, highlighted fence.
puts "hello"
```

```ruby runnable
# `runnable` adds a Run button. For SQL, it loads the query into the lesson's
# console AND runs it.
puts 1 + 1
```

```text
# `text` fences are styled for ASCII diagrams — tighter leading, no language label.
  browser ──▶ DNS ──▶ TCP ──▶ TLS ──▶ HTTP
```
````

**Every code example must actually run and produce the output you claim.** If you show a
benchmark, you ran it. Highlighting happens at build time, so no language configuration is
needed — just name it.

---

## 5. Quizzes — `quiz.yml`

```yaml
passScore: 0.7          # 0..1. A lesson with a quiz is not complete until this is met.
questions:
  # ---- single choice ----
  - id: falsy
    kind: choice
    concept: objects                     # links this question to the review queue
    prompt: Which of these is falsy in Ruby?
    options:
      - text: "`nil`"
        correct: true
        feedback: Correct — one of exactly two falsy values.
      - text: "`0`"
        feedback: >-
          `0` is truthy in Ruby. This is the classic trap for people arriving from
          JavaScript or Python.
    explanation: >-
      Ruby has exactly two falsy values. This matters in real code: `if user.age` is
      true for someone aged 0.

  # ---- multiple choice ----
  - id: both
    kind: multi                          # partial credit; a wrong pick subtracts
    prompt: Which of these are falsy?
    options: [...]

  # ---- ordering ----
  - id: lookup-order
    kind: order
    prompt: Put these in the order Ruby checks them.
    items:
      - The object's singleton class
      - Prepended modules
      - The class itself
    explanation: >-
      ...

  # ---- free recall ----
  - id: explain
    kind: recall                         # learner writes, then self-assesses
    prompt: Explain closures to a colleague in your own words.
    key_points:                          # revealed after they have written something
      - Captures the bindings from where it was defined
      - Not a copy of the values — mutations are visible outside
    model: >-                             # a model answer to compare against
      A closure is a function bundled with...
```

### Writing good feedback

**The `feedback` on a wrong option is the most valuable text in the file.** A learner who
picks it has a specific misconception; name it. "Incorrect" teaches nothing.

**`explanation` must teach the idea, not restate the answer.** It is shown to everyone,
right or wrong, immediately after they commit.

### About `recall` questions

The platform does not pretend to grade prose. There is no LLM in the core path, by design
— the educational experience must not depend on a paid API. So a recall question reveals
your `key_points` and `model` answer after the learner has written something, and asks
them to self-assess as *covered it / partly / missed it*.

That is not a workaround. Writing an explanation and then comparing it against a model is
one of the better-evidenced study techniques. It just means **`key_points` must be
specific enough to self-mark against.** "Understands closures" is useless. "Mentions that
the binding is captured, not copied" is markable.

---

## 6. Exercises — `exercise.yml`

```yaml
id: dsa-binary-search       # globally unique
language: javascript        # javascript | typescript | sql run in the browser
title: Write binary search
brief: >-
  What the learner has to build, and what the hidden tests cover.
starter: |
  function binarySearch(sorted, target) {
    // Guiding comments go here — they are the scaffolding.
  }
solution: |
  function binarySearch(sorted, target) {
    ...
  }
hints:                      # revealed one at a time, in order
  - Start from the invariant, not the code.
  - Is `low === high` an empty range, or a range of one?
tests:
  - id: finds-middle
    name: Finds a value in the middle
    call: binarySearch([1, 3, 5, 7], 5)      # evaluated with the learner's code in scope
    expect: 2                                 # deep-compared
  - id: terminates
    name: Terminates on a large array
    hidden: true                              # not shown until after a run
    call: "binarySearch(Array.from({ length: 100000 }, (_, i) => i), 99999)"
    expect: 99999
```

- `call` is a JavaScript expression evaluated with the learner's code in scope. It can be
  an IIFE for anything involving state or exceptions.
- `expect` is deep-compared, so `[1,2,3]` matches a freshly built array.
- `hidden: true` tests are not shown before running. Use them for edge cases, so the
  learner has to think rather than code to the visible examples.
- **The solution stays locked** until the tests pass or every hint has been read.

Languages other than JavaScript, TypeScript and SQL cannot run in the browser. Write the
exercise anyway — it renders as the problem, the tests and the reference solution, with an
honest note about why there is no Run button.

---

## 7. SQL playgrounds — `playground.yml`

```yaml
language: sql
notes: >-
  Shown above the console. Point out anything the lesson's examples depend on —
  which rows are NULL, which value is rare.
starter: |
  SELECT name FROM users WHERE city = 'Pune';
indexes: {}                 # start with none, so the learner turns them on themselves
seed:
  tables:
    - name: users
      columns:
        - { name: id, type: integer }
        - { name: city, type: text }
      rows:
        - [1, "Pune"]
        - [2, null]
```

**A `runnable` SQL fence requires a `playground.yml`** — otherwise the Run button would
query an empty database. CI enforces this.

### Generated rows

Selectivity demonstrations need large tables, and 100,000 rows of literal YAML is
unreviewable. Declare how the rows are made instead:

```yaml
    - name: events
      columns:
        - { name: id, type: integer }
        - { name: kind, type: text }
        - { name: amount, type: integer }
      generate:
        count: 100000
        columns:
          - { kind: sequence, start: 1 }
          - { kind: rare, at: [61234], value: rare, otherwise: common }
          - { kind: random_int, min: 1, max: 999, seed: 17 }
```

Generators are deterministic, so the row counts a lesson quotes stay true. The *spec* is
shipped to the browser (about 400 bytes) and expanded there — shipping the expanded rows
would be 5 MB for one lesson.

| Generator | Produces |
|---|---|
| `sequence` | `start`, `start + step`, … — for primary keys |
| `cycle` | `values` repeated in order |
| `rare` | `value` at the exact indices in `at`, `otherwise` everywhere else |
| `weighted` | each `value` for its `weight` share of rows, exactly |
| `random_int` | between `min` and `max`, deterministic for a given `seed` |
| `random_choice` | one of `values` |
| `date_series` | `start` plus `i` days or hours |
| `template` | `format` with `{i}` substituted |
| `constant` | the same `value` everywhere |

---

## 8. The engine's limits

The SQL engine is a teaching tool, not PostgreSQL. It supports `SELECT` with projection
and aliases, `WHERE` (comparisons, `AND`/`OR`/`NOT`, `IN`, `LIKE`, `IS NULL`), `JOIN` and
`LEFT JOIN`, `GROUP BY`/`HAVING`, `COUNT`/`SUM`/`AVG`/`MIN`/`MAX`, `DISTINCT`, `ORDER BY`
and `LIMIT`. It reports rows examined, index usage and a plan — which is the whole reason
it exists rather than embedding SQLite.

It does not support subqueries, CTEs, window functions, `UNION`, or anything that writes.
If your lesson needs those, write about them and link to a real database rather than
pretending.

---

## 9. Checking your work

```bash
npm run content:validate     # the gate CI runs — errors block, warnings nudge
npm run dev                  # see it rendered
```

The validator checks frontmatter fields and allowed values, required and misspelled
blocks, duplicate lesson and question ids, dead internal links, quizzes with no correct
option or no explanation, exercises with no tests or no solution, seed rows that do not
match their column count, indexes naming columns that do not exist, and `last_reviewed`
dates that are invalid or over a year old.

---

## 10. The bar

Before opening the pull request, ask:

1. **Does it start from the problem?** Never open with a definition. Open with what hurt.
2. **Could a beginner follow it?** No unexplained jargon. When a term is unavoidable:
   introduce it, define it plainly, give an analogy, then use it.
3. **Would an experienced engineer learn something?** Usually from `:::internals`,
   `:::failure` or `:::tradeoffs` — the parts tutorials skip.
4. **Does every example actually run?** Including the output you claim it prints.
5. **Does it say what this costs?** Every technology trades something away.
6. **Does it say what breaks?** What happens at 3am is often the most valuable paragraph.
7. **Is it original?** Write your own explanation. Link to primary docs. Never copy from a
   paid course, a book, or another site.

If a lesson is a 5,000-word wall of prose with no interaction, it is not finished. Break
it with examples, a checkpoint, and a quiz.
