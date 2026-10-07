---
title: The three resets
summary: >-
  Soft, mixed and hard. One picture makes the choice obvious and permanent.
level: basic
minutes: 11
status: stable
last_reviewed: "2026-10-07"
tags: [git, reset, undo]
concepts: [reset, undo, reflog]
prerequisites: [branches, staging-area]
interview:
  - question: Explain the difference between the three reset modes.
    level: basic
    answer: >-
      All three move the branch pointer to the commit you name. They differ in how much
      else they drag along. `--soft` moves the branch only, leaving the index and working
      tree untouched — so the undone changes appear staged. `--mixed`, the default, also
      resets the index, so the changes appear unstaged. `--hard` additionally overwrites
      the working tree, discarding those changes entirely. Only `--hard` can lose work,
      and only work that was never committed.
    followUps:
      - "When would you use `--soft` over `--mixed`?"
      - "What is the difference between `reset` and `revert`, and when must you use revert?"
  - question: When should you use `git revert` instead of `git reset`?
    level: basic
    answer: >-
      When the commit has been pushed and others may have it. `reset` rewrites history by
      moving the branch backwards, which requires a force push and breaks everyone whose
      commits reference the discarded ones. `revert` adds a *new* commit that undoes the
      change, so history only moves forward and nothing anyone else has is invalidated.
      Rule of thumb: reset for local work, revert for anything shared.
resources:
  - title: "Pro Git — Reset Demystified"
    url: https://git-scm.com/book/en/v2/Git-Tools-Reset-Demystified
---

## Three commands that look identical

```bash
git reset --soft  HEAD~1
git reset --mixed HEAD~1      # the default
git reset --hard  HEAD~1
```

Each "undoes the last commit". Picking the wrong one either wastes ten minutes or destroys
an hour's work, and the names give almost no hint which is which.

:::problem
The names describe *how much is reset*, which only helps if you already know what the three
things are. Without the model from the previous lesson — branch pointer, index, working
tree — the words soft, mixed and hard are arbitrary.

With that model, there is nothing left to memorise.
:::

:::what
Every `git reset` does one thing unconditionally: **move the current branch pointer to the
commit you name.** The flag decides whether it also resets the index and the working tree.
:::

:::how
```text
  Before:          A ◀── B ◀── C ◀── main, HEAD
                                     index and worktree match C

  git reset --soft B

                   A ◀── B ◀── main, HEAD      ( C is now unreferenced )
                              index:    still C's content  → changes STAGED
                              worktree: still C's content

  git reset --mixed B          (the default)

                   A ◀── B ◀── main, HEAD
                              index:    reset to B         → changes UNSTAGED
                              worktree: still C's content

  git reset --hard B

                   A ◀── B ◀── main, HEAD
                              index:    reset to B
                              worktree: reset to B         → changes GONE
```

One table, and the decision is made:

| Flag | Branch | Index | Working tree | C's changes end up |
|---|---|---|---|---|
| `--soft` | moved | kept | kept | **staged**, ready to re-commit |
| `--mixed` | moved | reset | kept | **unstaged**, still in your files |
| `--hard` | moved | reset | reset | **discarded** |

Read the table top to bottom: each row resets one more thing than the row above.
:::

:::why
The three modes exist because "undo the last commit" means at least three different things
in practice:

- *"The commit was fine but the message was wrong, or I want to split it"* → `--soft`,
  because you want the changes back in the index.
- *"The commit was premature — I want to keep working"* → `--mixed`, because you want the
  changes in your files but not staged.
- *"That whole line of work was a mistake"* → `--hard`.

Git declines to guess which you meant.
:::

## Each one, in the situation it is for

```bash
# --soft: re-commit the same changes differently.
# Split one large commit into three:
$ git reset --soft HEAD~1
$ git reset                       # unstage everything (--mixed on HEAD)
$ git add -p                      # stage the first logical chunk
$ git commit -m "Fix pagination off-by-one"
$ git add -p && git commit -m "Fix typo"
$ git add . && git commit -m "Remove unused import"

# --soft is also how you combine the last three commits into one:
$ git reset --soft HEAD~3
$ git commit -m "Implement pricing rules"

# --mixed: the commit was premature.
$ git reset HEAD~1                # changes back in the working tree, unstaged
$ # keep working, commit when actually done

# --hard: abandon the work.
$ git reset --hard HEAD~1
```

:::mistakes
**`git reset <file>` is a completely different operation.** With a path, reset does not
move the branch at all — it copies that path from the commit into the index. It is an
unstage:

```bash
$ git reset HEAD~1            # moves the branch. History changed.
$ git reset file.js           # unstages file.js. History untouched.
$ git restore --staged file.js # the modern, unambiguous spelling
```

Two unrelated behaviours under one command name. This is why `git restore` was added.

**`--hard` discards uncommitted work with no recovery.** The reflog records where *refs*
pointed. Changes that were never committed were never in a ref:

```bash
$ git reset --hard HEAD~1     # the COMMIT is in the reflog — recoverable
$ git reset --hard             # your uncommitted edits — gone
```

Those are the same command and only one of them is safe. If there is anything uncommitted
you care about, `git stash` first — stash creates real commits.

**Using `reset` on a pushed branch.** It moves the branch backwards, so the remote's
commits are no longer your ancestors and you need `--force`. Everyone else's history now
references commits you discarded.

```bash
# Pushed? Use revert. It only moves forward.
$ git revert HEAD                     # new commit that undoes the last one
$ git revert a1b2c3d                  # undo a specific commit
$ git revert --no-commit HEAD~3..HEAD # undo a range, as one commit
```

**Reverting a merge needs `-m`.** A merge has two parents, so "undo it" is ambiguous —
which side are you keeping?

```bash
$ git revert -m 1 <merge-sha>   # keep the first parent (usually the target branch)
```
:::

:::realworld
The decision in practice is one question: **has anyone else seen these commits?**

```text
  Has it been pushed to a shared branch?

   NO ──▶ reset is fine. Pick the mode by where you want the changes:
          --soft  (staged)  --mixed  (unstaged)  --hard  (gone)

  YES ──▶ revert. History moves forward, nobody's parents are invalidated.
          The undone change stays visible in the log, which is usually
          what you want on a shared branch anyway.
```

The secondary benefit of `revert` on a shared branch is auditability: the log shows that a
change was made and then deliberately undone, which is more honest than a history where it
never happened. On a release branch that is a feature rather than a cost.

```bash
# The everyday four, in order of how often you need them:
$ git restore file.js            # discard changes to one file
$ git restore --staged file.js   # unstage one file
$ git reset --soft HEAD~1        # undo the commit, keep it staged
$ git revert HEAD                # undo a pushed commit safely
```
:::

:::failure
**Recovering from a reset you regret.** The reflog is the answer, and it is worth doing
once now so you are not learning it under pressure.

```bash
# Where has this branch been?
$ git reflog
a1b2c3d HEAD@{0}: reset: moving to HEAD~1
9f8e7d6 HEAD@{1}: commit: Add pricing rules      ← the commit I discarded
4c5d6e7 HEAD@{2}: commit: Add README

# Put the branch back:
$ git reset --hard 9f8e7d6
# or, by reflog position:
$ git reset --hard HEAD@{1}

# A branch you deleted:
$ git reflog                      # find its last tip
$ git branch recovered 9f8e7d6

# A commit with no reflog entry at all (made on a detached HEAD, long ago):
$ git fsck --lost-found
dangling commit 7a8b9c0...
$ git show 7a8b9c0                # is this it?
$ git branch recovered 7a8b9c0
```

The reflog's default retention is **90 days for reachable entries and 30 for unreachable
ones**. Beyond that, `git gc` can prune. So the honest position is: *reset is reversible
for about a month*, which is a generous net and not a guarantee.

Note also that the reflog is **local and per-clone**. It is not pushed. If you reset and
then delete your clone, it is gone — a colleague's clone will have their own reflog, not
yours.
:::

:::tradeoffs
**`reset`** gives a clean history with no record of the mistake. On a private branch that
is strictly better: nobody benefits from seeing three abandoned attempts.

Costs: it rewrites, so it is unsafe on anything shared, and the audit trail disappears.

**`revert`** is always safe and leaves both the change and its undoing visible.

Costs: the history is noisier, and reverting a revert is a sentence nobody enjoys reading
in a log.

The convention most teams land on — **rewrite freely before review, never after** — is a
direct consequence of this, not an arbitrary rule.
:::

:::checkpoint
For each situation, name the command:

1. Last commit's message has a typo. Nothing pushed.
2. Last three commits should be one commit. Nothing pushed.
3. Last commit broke production. It is pushed and others have pulled.
4. You staged `secrets.env` by accident but have not committed.
5. You ran `git reset --hard HEAD~2` an hour ago and want those commits back.
6. You want to undo a merge commit that is already on main.

One of these six has no safe answer if you got it wrong ten minutes ago. Which, and why?
:::

:::interview
Reset is a very common question because the three modes map cleanly onto whether someone
understands Git's three states.

Answer with the invariant first: *"all three move the branch pointer. They differ in
whether they also reset the index and the working tree — soft moves the branch only so the
changes come back staged, mixed also resets the index so they come back unstaged, hard
resets the working tree too so they are gone."*

Then the thing that shows you have used it in anger: *"so `--soft HEAD~3` is how I squash
three commits, and `--hard` is the only one that can lose work — and only work that was
never committed, because the reflog covers everything that was."*

The follow-up is reset versus revert, and the discriminator is not preference: *"has it
been pushed? Reset rewrites history, so on a shared branch it needs a force push and breaks
everyone's parent references. Revert adds a forward commit, so it is always safe — and the
audit trail is usually a feature on a shared branch."*
:::

## What you now know

- Every reset moves the branch pointer. The flag decides whether the index and working
  tree follow.
- `--soft` leaves changes staged, `--mixed` leaves them unstaged, `--hard` discards them.
- `git reset <path>` is an unrelated operation — an unstage. Prefer `git restore --staged`.
- Only `--hard` loses work, and only work never committed. Stash first if unsure.
- Reset on pushed commits requires a force push and breaks collaborators. Use `revert`.
- `git revert -m 1` for merges, since "undo" is ambiguous with two parents.
- The reflog recovers resets for roughly a month, is local, and is not pushed.
