---
title: Branches, HEAD, and the index
summary: A branch is a 41-byte file. Once you believe that, the three states of a change stop being confusing.
level: beginner
minutes: 13
status: stable
last_reviewed: "2026-10-07"
tags: [git, branches, index, head]
concepts: [branches, head, staging-area, detached-head]
prerequisites: [git-objects]
interview:
  - question: What is a Git branch?
    level: beginner
    answer: >-
      A file containing a commit hash. `.git/refs/heads/main` is 41 bytes — the hash and a
      newline. Committing writes a new hash into that file. That is the whole mechanism,
      and it is why creating a branch is instant regardless of repository size, and why
      deleting one destroys nothing: the commits are still in the object store, just
      unreferenced.
    followUps:
      - "So what is HEAD, and what makes it detached?"
      - "If a branch is just a pointer, what does `git merge --ff-only` actually do?"
  - question: What is the staging area for?
    level: basic
    answer: >-
      It lets you choose what goes into the next commit, separately from what you have
      changed. That matters because the unit of work and the unit of history are different
      things — you often touch five files while fixing one bug plus noticing two unrelated
      problems, and three small commits are more useful to a reviewer and to `git bisect`
      than one large one. Mechanically the index is a binary file listing paths, modes and
      blob hashes, which is also why `git status` is fast.
resources:
  - title: "Pro Git — Git References"
    url: https://git-scm.com/book/en/v2/Git-Internals-Git-References
---

## A branch is smaller than you think

```bash
$ cat .git/refs/heads/main
a1b2c3d4e5f67890abcdef1234567890abcdef12

$ wc -c .git/refs/heads/main
41 .git/refs/heads/main        # 40 hex characters and a newline
```

That is a branch. Not a copy of the code, not a list of commits — one hash.

:::problem
If you come from Subversion, a branch was a directory copy on the server and creating one
was a real operation with real cost. That mental model makes Git's branching feel
suspicious: how can it be free?

It is free because there is nothing to copy. The commits already exist in the object store
and already point at their parents. A branch is just a label saying "this one is the tip".
:::

:::what
A **ref** is a file under `.git/refs/` containing a commit hash. A **branch** is a ref
under `refs/heads/`. **HEAD** is a file saying which ref you are currently on.
:::

:::how
```text
  .git/
    HEAD                         "ref: refs/heads/main"      ← which branch am I on
    refs/
      heads/
        main                     a1b2c3…                     ← tip of main
        feature/pricing          9f8e7d…                     ← tip of the feature
      tags/
        v1.0                     4c5d6e…
      remotes/
        origin/main              a1b2c3…                     ← where origin was last seen

  The commit graph, with three labels on it:

        ┌── main ──┐
        ▼          │
  A ◀── B ◀── C ◀──┘
        │
        └── D ◀── E ◀── feature/pricing

  Creating a branch:  write one file. Instant, at any repository size.
  Deleting a branch:  delete one file. The commits remain, unreferenced.
  Committing:         write the new hash into the file HEAD points at.
```
:::

:::why
Making a branch a pointer rather than a copy is what made branching cheap, and cheap
branching is what made the whole modern pull-request workflow possible. The feature was not
"branches" — Subversion had those. The feature was branches that cost nothing, so you stop
rationing them.
:::

## HEAD, attached and detached

```bash
# Normally HEAD points at a branch, which points at a commit. Two hops.
$ cat .git/HEAD
ref: refs/heads/main

# Check out a commit directly and HEAD points straight at it. One hop.
$ git checkout a1b2c3d
You are in 'detached HEAD' state.

$ cat .git/HEAD
a1b2c3d4e5f67890abcdef1234567890abcdef12
```

:::how
```text
  ATTACHED                            DETACHED

  HEAD ──▶ refs/heads/main ──▶ C      HEAD ──▶ C

  A commit updates main, and          A commit updates HEAD only. Nothing
  HEAD follows it.                    else points at the new commit — so
                                      moving away leaves it unreferenced.
```

Detached HEAD is not an error state. It is the correct state when you want to look at
history without being on a branch — `git bisect` uses it, and so does checking out a tag.

The danger is specific: **commits made while detached have no branch pointing at them.**
Check out something else and nothing references them. They are recoverable from the reflog,
but nothing is holding them.

```bash
# If you have committed while detached and want to keep it:
$ git switch -c keep-this-work       # create a branch at the current HEAD

# `git switch` exists partly to make this harder to do by accident:
$ git switch main                    # only moves between branches
$ git switch --detach a1b2c3d        # detaching must be explicit
```
:::

## Three places a change can be

This is the other thing people find confusing, and it is also simpler than it looks.

```javascript runnable
// Not Git, but the same three-state model, so you can see the transitions.
const states = { worktree: [], index: [], commit: [] };

function edit(file)  { states.worktree.push(file); }
function add(file)   { states.index.push(states.worktree.pop()); }       // git add
function commit()    { states.commit.push(...states.index.splice(0)); }  // git commit
function restore()   { states.worktree.pop(); }                          // git restore
function unstage()   { states.worktree.push(states.index.pop()); }       // git restore --staged

const show = (label) =>
  console.log(`${label.padEnd(18)} worktree=${JSON.stringify(states.worktree)} index=${JSON.stringify(states.index)} commits=${states.commit.length}`);

show("start");
edit("a.js");         show("after edit");
add("a.js");          show("after git add");
edit("b.js");         show("edit another");
commit();             show("after commit");
console.log("  → b.js was never staged, so it is not in the commit");
```

:::how
```text
  working tree        index (staging)        repository
  ───────────         ───────────────        ──────────
  your files          what the next          committed
  as they are         commit will contain    history

       │   git add ────────▶  │   git commit ─────▶  │
       │                      │                      │
       │  ◀──── git restore --staged ────            │
       │  ◀──────────── git restore ─────────────────┘
                              (or git checkout -- <file>, older syntax)

  git diff              worktree vs index     "what have I not staged?"
  git diff --staged     index vs HEAD         "what will I commit?"
  git diff HEAD         worktree vs HEAD      "what have I changed in total?"
```

Those three diffs are the thing worth memorising. Most confusion about staging is actually
confusion about which pair you are being shown.
:::

:::realworld
The index earns its keep when one editing session contains several logical changes:

```bash
# You fixed a bug, and also noticed a typo and tidied an import.
$ git add -p                  # interactively stage individual hunks
$ git commit -m "Fix off-by-one in pagination"

$ git add -p
$ git commit -m "Fix typo in error message"

$ git add .
$ git commit -m "Remove unused import"
```

Three commits from one session. The payoff is not tidiness — it is that `git bisect` can
now identify which of the three broke something, `git revert` can undo one without the
others, and a reviewer can read the pagination fix without the typo noise.

`git add -p` is the single highest-value Git command most people never learn.

```bash
# Related: committing a subset you have not finished thinking about
$ git stash push -m "half-done refactor" -- src/pricing.js
$ git stash list
$ git stash pop
```
:::

:::mistakes
**Expecting `git add` to be a snapshot of the file forever.** It stages the content *as it
is now*. Edit the file afterwards and the commit contains the staged version, not your
latest:

```bash
$ echo "version 1" > f.txt && git add f.txt
$ echo "version 2" > f.txt
$ git commit -m "add f"         # commits "version 1"
$ cat f.txt                      # still "version 2" in your working tree
$ git status                      # f.txt shows as modified again
```

This surprises people constantly, and it is the index doing exactly what it promised.

**`git checkout` doing two unrelated jobs.** It switched branches *and* discarded file
changes, with the difference being whether you passed `--`. A typo could silently destroy
work. That is why Git 2.23 split it:

```bash
$ git switch main              # change branch
$ git restore file.js          # discard changes to a file
$ git restore --staged file.js # unstage
$ git checkout ...             # still works; prefer the above
```

**Deleting a branch and thinking the work is gone.** `git branch -d feature` deletes a
41-byte file. The commits are in the object store and in your reflog:

```bash
$ git reflog                      # find the old tip
$ git branch feature a1b2c3d      # put a label back on it
```

**Confusing `origin/main` with `main`.** `refs/remotes/origin/main` is a cached record of
where origin was *when you last fetched*. It is not live. `git fetch` updates it;
`git status` comparing you to it is comparing against possibly-stale information.
:::

:::failure
**`git reset --hard` discards uncommitted work with no reflog entry.**

The reflog records where *refs* pointed. Uncommitted changes were never in a commit, so
there is nothing to recover:

```bash
$ git reset --hard HEAD        # uncommitted changes: gone, unrecoverably
$ git stash                     # the safe version — it creates commits
```

The one-line habit that prevents this: **when in doubt, `git stash` instead of
`git reset --hard`.** Stash creates real commit objects, so it is in the object store and
recoverable. Reset --hard on uncommitted work is one of very few genuinely destructive Git
operations.

```bash
# Things that ARE recoverable (they moved a ref, and the reflog remembers):
git reset --hard <older-commit>   # on committed work
git rebase                         # gone wrong
git commit --amend
git branch -D

# Things that are NOT:
git reset --hard                   # discarding uncommitted changes
git clean -fd                      # deleting untracked files
git checkout -- file               # discarding one file's changes
```
:::

:::tradeoffs
**The index** gives you control over history independent of your editing, which makes
`bisect`, `revert` and review all more useful. The cost is a third state to understand,
and it is the main reason Git is harder to learn than tools without one.

Mercurial deliberately omitted it, on the view that the complexity was not worth it, and
later added it back as an extension because people wanted it. That is reasonable evidence
that the trade is genuinely contested rather than obviously right.

**Branches as pointers** make branching free and merging a graph operation. The cost is
that a branch carries no inherent meaning — nothing distinguishes a long-lived release
branch from yesterday's experiment except convention, which is why every team invents a
naming scheme and a workflow document.
:::

:::debugging
When you do not know what state you are in, four commands answer it completely:

```bash
$ git status -sb          # branch, ahead/behind, and short file states
$ git log --oneline --graph --all -20
$ cat .git/HEAD           # attached to a branch, or detached?
$ git reflog -10          # where have my refs been recently?
```

`git status -sb` is worth the muscle memory — the `-sb` gives you the branch and tracking
info in two lines instead of fifteen.
:::

:::checkpoint
Run this sequence and explain each result:

```bash
echo "one" > f.txt && git add f.txt && echo "two" > f.txt
git status                 # why does f.txt appear twice?
git diff                   # which pair is this comparing?
git diff --staged          # and this one?
git commit -m "x"
cat f.txt                  # why is this "two"?
git status                 # why is f.txt still modified?
```

Then: you are on a detached HEAD and have made two commits. Write the single command that
keeps them.
:::

:::interview
"What is a branch?" is a quick seniority check. *"A file containing a commit hash — 41
bytes. Which is why creating one is instant at any repository size, and why deleting one
destroys nothing."*

The staging question is better, because the interesting answer is about *why* rather than
*what*: *"it separates what I have changed from what I am committing, so the unit of work
and the unit of history can differ. One editing session is usually one bug fix plus two
things I noticed — three commits make `bisect` and `revert` useful in a way one commit
does not. `git add -p` is how I actually do it."*

If detached HEAD comes up, make clear it is not an error: *"it means HEAD points at a
commit rather than a branch, which is correct for bisect or inspecting a tag. The risk is
that commits made there have nothing pointing at them, so I create a branch before moving
away."*
:::

## What you now know

- A branch is a file holding one commit hash. Creating and deleting are trivial; commits
  survive deletion.
- HEAD says which ref you are on. Detached means it points at a commit directly — valid,
  but nothing holds commits you make there.
- Three states: working tree, index, repository. The three `git diff` forms compare
  different pairs of them.
- `git add` stages content as of now; later edits are not included.
- `git switch` and `git restore` split what `git checkout` used to overload.
- `origin/main` is a cache of the last fetch, not live.
- Almost everything is reflog-recoverable. `reset --hard` on *uncommitted* work is not —
  stash instead.
