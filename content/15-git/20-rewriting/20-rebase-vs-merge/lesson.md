---
title: Rebase versus merge
summary: Not a style war. Two operations with different outputs, and a rule about which is safe when.
level: basic
minutes: 14
status: stable
last_reviewed: "2026-10-07"
tags: [git, rebase, merge, conflicts]
concepts: [rebase, merge, fast-forward, conflicts]
prerequisites: [git-objects, branches]
interview:
  - question: What is the difference between merge and rebase?
    level: basic
    answer: >-
      Merge creates one new commit with two parents, joining the histories and leaving both
      branches' commits exactly as they were. Rebase replays your commits one at a time on
      top of the target, creating new commits with new hashes and new parents — the
      original commits are discarded. So merge preserves history and records that a
      branch happened; rebase produces a linear history and erases the fact that the work
      was done in parallel.
    followUps:
      - "Which commits does rebase change the hash of, and why?"
      - "What is the golden rule of rebasing, and what goes wrong if you break it?"
  - question: What is a fast-forward merge?
    level: basic
    answer: >-
      When the target branch has no commits that your branch does not already contain, the
      merge needs no merge commit — Git can simply move the branch pointer forward to your
      tip. It is not really a merge, it is a pointer move. `--no-ff` forces a merge commit
      anyway, which some teams want so that the log shows where each feature began and
      ended.
resources:
  - title: "Pro Git — Rebasing"
    url: https://git-scm.com/book/en/v2/Git-Branching-Rebasing
---

## Two branches, one question

You branched off `main`, did three commits, and meanwhile `main` moved on.

```text
              D ◀── E ◀── F ◀── feature
             /
  A ◀── B ◀── C ◀── main
```

You need `feature` to incorporate `C`. Two commands do it, and they produce genuinely
different repositories.

:::problem
This is often argued about as a matter of taste — "clean history" versus "honest history".
It is not a matter of taste; the two commands have different inputs and different outputs,
and one of them is unsafe in a situation the other is not.

Taste only enters once you know which situations those are.
:::

:::what
**Merge** creates one new commit with two parents, joining the two histories. Every
existing commit is untouched.

**Rebase** replays your commits one at a time onto the target, producing *new* commits with
new parents and therefore new hashes. The originals become unreferenced.
:::

:::how
```text
  git merge main          (while on feature)

              D ◀── E ◀── F ◀─── M ◀── feature
             /                  /
  A ◀── B ◀── C ◀──────────────┘
              ▲
             main

  One new commit M, with two parents. D, E, F keep their hashes.
  The log shows that a branch existed and was joined.


  git rebase main         (while on feature)

                          D' ◀── E' ◀── F' ◀── feature
                         /
  A ◀── B ◀── C ◀────────┘
              ▲
             main

  Three NEW commits D', E', F' — same changes, different parents,
  therefore different hashes. D, E, F are now unreferenced.
  The log is linear and shows no sign the work was parallel.
```

The key line: **rebase does not move commits. It copies them and abandons the originals.**
That is the whole reason the golden rule exists.
:::

:::why
Both operations get `C` into your branch. They differ in what they *record*.

Merge records the truth: two lines of work existed and were joined at this point. That is
valuable to anyone asking what happened.

Rebase records a fiction that is more useful to read: the work appears to have been done
on top of the latest main, in one line. That is valuable to anyone asking *when did this
bug appear*, because `git bisect` over a linear history is straightforward and over a
tangle of merges is not.

So the choice is not cleanliness versus honesty — it is which reader you are optimising
for. The constraint that settles most arguments is that only one of them is safe on shared
history.
:::

## The golden rule

> **Never rebase commits that exist outside your own clone.**

:::failure
Here is exactly what goes wrong, because "it breaks things" is not a reason anyone
remembers.

```text
  You and a colleague both have:

    A ◀── B ◀── C ◀── shared-branch

  You rebase onto a new main and force push:

    A ◀── B' ◀── C' ◀── shared-branch   (on the remote)

  Your colleague still has B and C locally. They pull.

  Git sees two histories with no common tip:
    theirs:  A ◀── B  ◀── C
    remote:  A ◀── B' ◀── C'

  A merge produces:

    A ◀── B  ◀── C  ◀──┐
                       M ◀── shared-branch
    A ◀── B' ◀── C' ◀──┘

  Every change now appears TWICE in the history, as both B and B'.
  Conflicts in every file the rebase touched. This is the mess.
```

```bash
# The guard that would have prevented it:
$ git push --force-with-lease
# Refuses if the remote moved since your last fetch. There is no good
# reason to use plain --force on a branch anyone else might have.
```

The rule has one important nuance: **your own feature branch, even if pushed, is usually
fine to rebase** — as long as nobody has based work on it. Pushing to a remote is not the
threshold; *somebody else having pulled it* is. That is why force-with-lease is the right
tool: it checks the actual condition rather than the proxy.
:::

## Fast-forward

```bash
# `main` has not moved since you branched. No merge commit is needed —
# Git just moves the pointer.
$ git merge feature
Updating c3d4e5f..a1b2c3d
Fast-forward

# Force a merge commit anyway:
$ git merge --no-ff feature

# Refuse to merge unless it can fast-forward:
$ git merge --ff-only feature
```

:::how
```text
  BEFORE                          git merge feature   (fast-forward)

  A ◀── B ◀── main                A ◀── B ◀── C ◀── D ◀── main, feature
              │                                          ▲
              └── C ◀── D ◀── feature                    both point here

  No commit is created. The pointer moved. This is why `git pull` on an
  unchanged branch says "Fast-forward" and produces no merge commit.
```

`--no-ff` matters to some teams because the merge commit is the only record of where a
feature started and ended. With fast-forward merges, a five-commit feature is
indistinguishable from five unrelated commits. `git log --first-parent` on a `--no-ff`
history gives you a readable list of features rather than every individual commit.
:::

## Interactive rebase

This is the part worth learning properly, because it is how you turn a messy local branch
into something reviewable.

```bash
$ git rebase -i main

# An editor opens:
pick a1b2c3 Add pricing model
pick d4e5f6 wip
pick 9f8e7d fix typo
pick 4c5d6e Add tests

# Edit it to:
pick   a1b2c3 Add pricing model
squash d4e5f6 wip
squash 9f8e7d fix typo
pick   4c5d6e Add tests

# Result: two clean commits instead of four, one of which was "wip".
```

| Command | Effect |
|---|---|
| `pick` | keep the commit as is |
| `reword` | keep the changes, edit the message |
| `edit` | stop so you can amend the contents |
| `squash` | fold into the previous commit, combining messages |
| `fixup` | fold into the previous commit, discard this message |
| `drop` | remove the commit entirely |
| `exec` | run a shell command — e.g. `exec npm test` after each commit |

```bash
# Autosquash: mark a commit as a fixup at commit time, then let rebase
# place it automatically.
$ git commit --fixup a1b2c3
$ git rebase -i --autosquash main

# Verify every commit in the branch actually builds:
$ git rebase -i --exec "npm test" main
```

That last one is genuinely useful before opening a pull request: it runs the tests at every
commit, which is the only way to know your history is bisectable rather than just tidy.

:::realworld
What teams actually do, and why:

| Policy | Rationale | Cost |
|---|---|---|
| **Merge everything** | Nothing is ever rewritten; no force pushes possible | Log is a tangle of merge commits; `git log` is hard to read |
| **Rebase feature onto main, then merge `--no-ff`** | Linear feature history, plus a clear boundary per feature | Requires discipline about the golden rule |
| **Squash on merge** (GitHub's default option) | One commit per pull request; main is very clean | Loses the individual commits; `bisect` granularity is per-PR |
| **Rebase and fast-forward** | Perfectly linear main | No record that features existed; hardest to revert a whole feature |

There is no consensus and the arguments are real on both sides. What matters more than the
choice is that it is **written down and the same for everyone**, because the failure mode
is two people on one branch with different habits.

The one position that is close to universally agreed: **rebase your own work before review,
and never after anyone else has it.**
:::

:::mistakes
**Rebasing and resolving the same conflict repeatedly.** Rebase replays commits one at a
time, so a conflict in an early commit can recur in each later one.

```bash
# Record resolutions and reuse them automatically:
$ git config --global rerere.enabled true
# "reuse recorded resolution" — resolves the repeat occurrences for you
```

`rerere` is underused and removes most of the pain of a long rebase.

**Not knowing how to abort.** Every one of these is reversible mid-flight:

```bash
$ git rebase --abort       # back to exactly where you started
$ git rebase --continue    # after resolving the current conflict
$ git rebase --skip        # drop the commit being applied
$ git merge --abort
$ git cherry-pick --abort
```

Knowing `--abort` exists is what makes experimenting with rebase safe.

**Assuming a merge conflict means something is broken.** A conflict means Git cannot decide
between two changes to the same region. It is a request for a decision, not an error — and
a successful auto-merge is not a guarantee of correctness either:

```javascript runnable
// Git merges by text. Both sides changed different lines, so there is no
// conflict — and the result is wrong.
const base   = ["function total(items) {", "  return items.length;", "}"];
const mine   = ["function total(items) {", "  return items.length;", "}", "// added a comment"];
const theirs = ["function total(items) {", "  return items.reduce((a,b)=>a+b.price,0);", "}"];

console.log("Git merges these cleanly, because the changed LINES do not overlap.");
console.log("Whether the result is correct is a question about meaning, not text.");
console.log("That is why a clean merge still needs tests.");
```
:::

:::tradeoffs
**Merge.** Nothing is rewritten, so it is always safe and always honest — the history
records what actually happened, including that two people worked in parallel.

Costs: `git log` on a busy repository becomes unreadable, and `git bisect` has to navigate
merge commits.

**Rebase.** Linear, readable history where every commit is a real state of the project, so
`bisect` is clean and `log` tells a story.

Costs: it rewrites, so it is unsafe on shared branches; it discards the genuine record of
when work was done; and it can require resolving the same conflict repeatedly.

The deeper point: these optimise for different readers. Merge optimises for the archivist
who wants to know what happened. Rebase optimises for the engineer who will read this log
in a year trying to find when a bug appeared. Most teams care more about the second, which
is why rebase-before-review has become common — but calling merge "messy" misses that it is
answering a different question.
:::

:::checkpoint
For each, say merge or rebase, and why:

1. Your local feature branch is three commits behind main. Nobody else has it.
2. A long-lived release branch needs changes from main.
3. Your branch is pushed and a colleague has opened a PR based on it.
4. Four commits on your branch include two "wip" and one "fix typo". Not pushed.
5. You need to bring one specific commit from another branch, not all of it.

Then: in case 3, what exact command would tell you whether a rebase is safe?
:::

:::interview
Rebase versus merge is asked constantly and answered as a preference, which is the weak
version.

Answer mechanically first: *"merge creates one commit with two parents and leaves
everything else alone. Rebase copies my commits onto a new base, so they get new hashes and
the originals are abandoned."* Then the consequence that matters: *"which is why rebase is
unsafe on anything someone else has — their commits reference parents that no longer exist,
and their next pull produces a history with every change in it twice."*

Then show you have a working policy rather than a side: *"I rebase my own branch before
review to get a readable history and make sure each commit builds — `rebase -i --exec npm
test`. I never rebase after anyone has based work on it, and I use `--force-with-lease` so
the tool checks that condition rather than me remembering."*

If conflicts come up, the sophisticated point is that a clean merge proves nothing: *"Git
merges text, so non-overlapping changes merge cleanly whether or not the result makes
sense. A clean merge still needs the tests to run."*
:::

## What you now know

- Merge adds one commit with two parents and rewrites nothing. Rebase copies commits and
  abandons the originals.
- Rebase therefore changes hashes, which is why it is unsafe on shared branches.
- The real threshold is whether someone has *pulled* it, not whether it was pushed —
  `--force-with-lease` checks the real condition.
- Fast-forward is a pointer move, not a merge. `--no-ff` forces a commit so features stay
  visible in the log.
- Interactive rebase with `squash`/`fixup`/`exec` is how a messy branch becomes reviewable
  and bisectable.
- `rerere` removes most repeated-conflict pain; `--abort` makes rebasing safe to try.
- A clean auto-merge is not a correct merge. Git merges text, not meaning.
