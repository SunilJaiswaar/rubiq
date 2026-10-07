#!/usr/bin/env node
/**
 * Scaffolding for contributors (brief §52).
 *
 *   npm run new:lesson   -- --track sql --module reading-data --title "Subqueries"
 *   npm run new:track    -- --slug redis --title "Redis"
 *   npm run new:module   -- --track sql --title "Transactions"
 *
 * The point is that a contributor should not have to reverse-engineer the directory
 * layout, the numeric prefixes or the frontmatter schema from existing files. This
 * writes a valid skeleton that already passes the validator's structural checks, with
 * every required block present and commented.
 */
import { mkdir, writeFile, readdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CONTENT = path.join(ROOT, 'content')

/* ------------------------------------------------------------------- args */

const [kind, ...rest] = process.argv.slice(2)

// Collect everything up to the next --flag as the value, so an unquoted multi-word
// title still arrives intact rather than silently truncating at the first space.
const args = {}
for (let i = 0; i < rest.length; i++) {
  const token = rest[i]
  if (!token?.startsWith('--')) continue
  const key = token.slice(2)
  const words = []
  while (i + 1 < rest.length && !rest[i + 1]?.startsWith('--')) {
    words.push(rest[++i])
  }
  args[key] = words.join(' ')
}

const slugify = (text) =>
  String(text ?? '')
    .toLowerCase().trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')

const die = (message) => {
  console.error(`\n✖ ${message}\n`)
  process.exit(1)
}

const today = new Date().toISOString().slice(0, 10)

/** Directories, ordered, with their numeric prefixes intact. */
async function listDirs(parent) {
  if (!existsSync(parent)) return []
  const entries = await readdir(parent, { withFileTypes: true })
  return entries
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !e.name.startsWith('_'))
    .map((e) => e.name)
    .sort()
}

/** Next prefix, in tens, so a lesson can always be inserted between two others. */
async function nextPrefix(parent) {
  const dirs = await listDirs(parent)
  const highest = dirs.reduce((max, name) => {
    const m = /^(\d+)/.exec(name)
    return m ? Math.max(max, Number(m[1])) : max
  }, 0)
  return String(highest + 10).padStart(2, '0')
}

async function findDir(parent, slug) {
  const dirs = await listDirs(parent)
  return dirs.find((name) => name.replace(/^\d+[-_]/, '') === slug)
}

/* ---------------------------------------------------------------- lesson */

const LESSON_TEMPLATE = ({ title, track }) => `---
title: ${title}
summary: >-
  One or two sentences. This appears in the catalogue and in search results, so make it
  say what the reader will be able to do afterwards — not what the lesson "covers".
level: beginner                 # beginner | basic | intermediate | advanced | expert
minutes: 15                     # delete this line to have it estimated from word count
version: ""                     # which version of the technology this describes, e.g. "3.3"
status: draft                   # draft | review | stable | deprecated
last_reviewed: "${today}"
tags: [${track}]
concepts: []                    # REQUIRED in practice — drives review, the graph and gap analysis
prerequisites: []               # concept names this lesson assumes

# Delete this block if the lesson has no interview angle, but most should.
interview:
  - question: ""
    level: beginner
    hint: ""
    answer: >-
      What a strong answer sounds like — not just the facts, but how to say them.
    followUps:
      - ""
    realWorld: >-
      Where this actually shows up.

resources:
  - title: ""
    url: ""
---

## Start from the problem, not the definition

Open with something the reader has felt. The reason the lesson exists is that this was
annoying, slow, or wrong before — say what that was.

:::problem
What hurt before this existed. Be concrete.
:::

:::history
What people did instead, and why it was not enough. Optional, but this is where a lot of
the "oh, *that* is why" happens.
:::

:::what
The plain definition. Now that the reader wants it, they can absorb it.

REQUIRED BLOCK.
:::

:::why
Why this is the answer to the problem above. What it buys you.

REQUIRED BLOCK.
:::

## How it works

\`\`\`text
A diagram often does more than three paragraphs.
Plain \`text\` fences are styled for this.
\`\`\`

:::how
The mechanism, at the level the reader needs. One of :::how, :::example or :::realworld
is REQUIRED.
:::

\`\`\`${track}
# Every example must actually run and produce what you say it does.
\`\`\`

:::internals
What happens one layer down. This is what an experienced reader comes for, and it powers
UNDER THE HOOD mode.
:::

:::realworld
What this looks like in production code — not a toy example.
:::

:::tradeoffs
What you give up. A lesson that lists only benefits is marketing.
:::

:::mistakes
What beginners get wrong, and why the wrong thing is tempting.
:::

:::failure
What happens when this breaks at 3am. Often the most valuable paragraph on the page.
:::

:::debugging
How you actually find out. Real commands, real output.
:::

:::checkpoint
A question the reader should answer before moving on. Not a quiz question — something
they have to think about.
:::

:::interview
How this gets asked, and what separates a strong answer from a recited one.
:::

## What you now know

- Three to six bullets. The reader should be able to skim these and know whether to
  re-read anything.
`

const QUIZ_TEMPLATE = `passScore: 0.7
questions:
  - id: first
    kind: choice               # choice | multi | order | recall
    concept: ""                # must match one of the lesson's concepts
    prompt: ""
    options:
      - text: ""
        correct: true
        feedback: Why this is right.
      - text: ""
        feedback: >-
          The misconception behind this choice, named. This is the most valuable text in
          the file — "incorrect" teaches nothing.
    explanation: >-
      Shown to everyone after they commit. Teach the idea here; do not just restate the
      answer.

  - id: explain-back
    kind: recall
    concept: ""
    prompt: >-
      A scenario that forces them to apply it, not recall it. "A colleague asks you
      why..." works well.
    key_points:                # revealed after they have written something
      - Specific enough to self-mark against
      - "\\"Understands X\\" is useless; \\"mentions that X is captured, not copied\\" is markable"
    model: >-
      A model answer to compare against.
`

const EXERCISE_TEMPLATE = (id) => `id: ${id}
language: javascript          # javascript | typescript | sql run in the browser
title: ""
brief: >-
  What they have to build, and a note that the hidden tests cover the edge cases.
starter: |
  function solve(input) {
    // Guiding comments are the scaffolding — say what to decide, not what to type.
  }
solution: |
  function solve(input) {
    return input;
  }
hints:                        # revealed one at a time
  - The first nudge should point at the approach, not the code.
  - The last one can be close to the answer.
tests:
  - id: basic
    name: ""
    call: solve(1)
    expect: 1
  - id: edge
    name: ""
    hidden: true              # not shown before a run, so they cannot code to it
    call: solve(0)
    expect: 0
`

/* ----------------------------------------------------------------- actions */

async function newTrack() {
  const slug = slugify(args.slug ?? args.title)
  if (!slug) die('Need --slug or --title.\n  npm run new:track -- --slug redis --title "Redis"')
  if (await findDir(CONTENT, slug)) die(`A track "${slug}" already exists.`)

  const dir = path.join(CONTENT, `${await nextPrefix(CONTENT)}-${slug}`)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'track.yml'), `title: ${args.title ?? slug}
tagline: One line that says what the reader gets, not what the track covers.
category: ${args.category ?? 'Languages'}    # Languages | Data | Computer Science | Web | Operations
icon: book
accent: indigo
difficulty: beginner
order: ${Number(await nextPrefix(CONTENT))}
prerequisites: []              # track slugs assumed by this one
description: >-
  Two or three paragraphs. The first should say why someone would learn this and what
  shape the track takes. Separate paragraphs with a blank line.
outcomes:
  - Something specific the reader can do afterwards
  - Phrased as a capability, not a topic
`)
  console.log(`\n✔ ${path.relative(ROOT, dir)}/track.yml`)
  console.log(`\nNext:\n  npm run new:module -- --track ${slug} --title "Foundations"\n`)
}

async function newModule() {
  const trackSlug = slugify(args.track)
  if (!trackSlug) die('Need --track.\n  npm run new:module -- --track sql --title "Transactions"')
  const trackDir = await findDir(CONTENT, trackSlug)
  if (!trackDir) die(`No track "${trackSlug}". Existing: ${(await listDirs(CONTENT)).map((d) => d.replace(/^\d+-/, '')).join(', ')}`)

  const trackPath = path.join(CONTENT, trackDir)
  const slug = slugify(args.slug ?? args.title)
  if (!slug) die('Need --title.')
  if (await findDir(trackPath, slug)) die(`Module "${slug}" already exists in ${trackSlug}.`)

  const dir = path.join(trackPath, `${await nextPrefix(trackPath)}-${slug}`)
  await mkdir(dir, { recursive: true })
  await writeFile(path.join(dir, 'module.yml'), `title: ${args.title ?? slug}
summary: What this group of lessons builds up to.
level: beginner
`)
  console.log(`\n✔ ${path.relative(ROOT, dir)}/module.yml`)
  console.log(`\nNext:\n  npm run new:lesson -- --track ${trackSlug} --module ${slug} --title "..."\n`)
}

async function newLesson() {
  const trackSlug = slugify(args.track)
  if (!trackSlug || !args.title) {
    die('Need --track and --title.\n  npm run new:lesson -- --track sql --module reading-data --title "Subqueries"')
  }

  const trackDir = await findDir(CONTENT, trackSlug)
  if (!trackDir) {
    die(`No track "${trackSlug}". Existing: ${(await listDirs(CONTENT)).map((d) => d.replace(/^\d+-/, '')).join(', ')}`)
  }
  const trackPath = path.join(CONTENT, trackDir)

  const modules = await listDirs(trackPath)
  const moduleSlug = slugify(args.module) || modules[0]?.replace(/^\d+[-_]/, '')
  if (!moduleSlug) die(`Track "${trackSlug}" has no modules yet. Run new:module first.`)

  const moduleDir = await findDir(trackPath, moduleSlug)
  if (!moduleDir) {
    die(`No module "${moduleSlug}" in ${trackSlug}. Existing: ${modules.map((d) => d.replace(/^\d+[-_]/, '')).join(', ')}`)
  }
  const modulePath = path.join(trackPath, moduleDir)

  const slug = slugify(args.slug ?? args.title)
  if (await findDir(modulePath, slug)) die(`Lesson "${slug}" already exists there.`)

  const dir = path.join(modulePath, `${await nextPrefix(modulePath)}-${slug}`)
  await mkdir(dir, { recursive: true })

  await writeFile(
    path.join(dir, 'lesson.md'),
    LESSON_TEMPLATE({ title: args.title, track: trackSlug }),
  )

  const written = ['lesson.md']
  if (args.quiz !== 'false') {
    await writeFile(path.join(dir, 'quiz.yml'), QUIZ_TEMPLATE)
    written.push('quiz.yml')
  }
  if (args.exercise === 'true') {
    await writeFile(path.join(dir, 'exercise.yml'), EXERCISE_TEMPLATE(`${trackSlug}-${slug}`))
    written.push('exercise.yml')
  }

  const rel = path.relative(ROOT, dir)
  console.log(`\n✔ ${rel}/`)
  for (const file of written) console.log(`    ${file}`)
  console.log(`
It will be at /learn/${trackSlug}/${slug}

Next:
  1. Write it. CONTENT_GUIDE.md has the block vocabulary and the quality bar.
  2. npm run content:validate     — tells you what is still missing
  3. npm run dev                  — see it rendered
`)
}

/* -------------------------------------------------------------------- main */

const ACTIONS = { track: newTrack, module: newModule, lesson: newLesson }

const action = ACTIONS[kind]
if (!action) {
  console.log(`
Scaffold new content.

  npm run new:lesson -- --track <slug> --module <slug> --title "<title>"
  npm run new:module -- --track <slug> --title "<title>"
  npm run new:track  -- --slug <slug> --title "<title>"

Options for new:lesson
  --quiz false        skip quiz.yml (it is created by default)
  --exercise true     also create exercise.yml
  --slug <slug>       override the slug derived from the title

Numeric directory prefixes are assigned in tens, so you can always insert a lesson
between two existing ones without renumbering.
`)
  process.exit(kind ? 1 : 0)
}

await action()
