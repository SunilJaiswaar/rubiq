---
title: Getting work back
summary: The reflog, fsck, and the handful of commands that mean you never re-clone in a panic again.
level: basic
minutes: 12
status: stable
last_reviewed: "2026-10-07"
tags: [git, reflog, recovery]
concepts: [reflog, recovery, garbage-collection]
prerequisites: [reset, git-objects]
interview:
  - question: You accidentally ran `git reset --hard HEAD~3`. How do you recover?
    level: basic
    answer: >-
      `git reflog` to find where the branch pointed before the reset, then
      `git reset --hard HEAD@{1}` or the commit hash directly. The reflog records every
      movement of every ref in your clone, so anything that was ever committed is
      recoverable for weeks. The one thing it cannot recover is uncommitted changes that
      `--hard` discarded, because those were never in a commit and so never in a ref.
    followUps:
      - "What if the commits were made on a detached HEAD with no reflog entry?"
      - "How long do you have, and what makes the window close?"
  - question: What is the reflog, and how is it different from the log?
    level: basic
    answer: >-
      `git log` walks the commit graph from a ref backwards through parents, so it shows
      history as it currently is. The reflog is a local journal of where each ref has
      *pointed over time* — including positions that are no longer in any history. That is
      why it can find commits that a reset or rebase orphaned. It is per-clone, never
      pushed, and expires.
resources:
  - title: "Pro Git — Maintenance and Data Recovery"
    url: https://git-scm.com/book/en/v2/Git-Internals-Maintenance-and-Data-Recovery
---

## The panic re-clone

Almost every engineer has done it: something went wrong with Git, the state looked
unrecoverable, and they deleted the folder and cloned again — losing whatever was only
local.

Almost none of those situations required it.

:::problem
Git's object store is append-only in practice. Commits are not deleted when you reset,
rebase or delete a branch — they lose their *references* and become unreachable. Unreachable
is not gone.

The reason people re-clone is not that the work is lost. It is that they do not know how to
find it.
:::

:::what
The **reflog** is a per-ref journal of every position a ref has held, stored under
`.git/logs/`. It is local, it is never pushed, and it expires.
:::

:::why
`git log` answers "what is the history of this branch?" by walking parent pointers from the
current tip. Anything the tip no longer reaches is invisible to it — which is precisely the
set of things you need after a mistake.

The reflog answers a different question: "where has this ref been?" That is the question
recovery requires.
:::

## The reflog

```bash
$ git reflog
a1b2c3d HEAD@{0}: reset: moving to HEAD~3
7f8e9d0 HEAD@{1}: commit: Add pricing tests        ← the work I thought I lost
4c5d6e7 HEAD@{2}: commit: Add pricing model
9a8b7c6 HEAD@{3}: checkout: moving from main to feature
2d3e4f5 HEAD@{4}: commit: Update README

# Put the branch back exactly where it was:
$ git reset --hard HEAD@{1}

# Or, safer — look first without moving anything:
$ git show 7f8e9d0
$ git branch rescue 7f8e9d0        # a label, nothing destroyed
```

:::how
```text
  THE COMMIT GRAPH                    THE REFLOG (a journal, not a graph)

  A ◀── B ◀── C ◀── main             HEAD@{0}  →  C   "reset: moving to C"
              │                       HEAD@{1}  →  E   "commit: add tests"
              └── D ◀── E            HEAD@{2}  →  D   "commit: add model"
                        ▲             HEAD@{3}  →  C   "checkout: feature"
                        │
            unreachable from main —
            invisible to `git log`,
            still listed in the reflog
```

The reflog has an entry per ref, so you can also ask about one branch specifically:

```bash
$ git reflog show main              # just main's movements
$ git reflog show --date=iso main   # with timestamps
```

And reflog positions work anywhere a commit does:

```bash
$ git diff HEAD@{1}                 # what changed since the previous position
$ git show main@{yesterday}         # where main was yesterday
$ git log main@{2.hours.ago}..main  # commits added in the last two hours
```
:::

## The recovery playbook

```bash
# 1. A bad reset, rebase, or amend.
$ git reflog
$ git reset --hard HEAD@{1}

# 2. A deleted branch.
$ git reflog                              # find its last tip
$ git branch recovered 7f8e9d0
# or, if you remember the name, git often records it:
$ git reflog | grep "feature/pricing"

# 3. A rebase that went wrong, mid-flight.
$ git rebase --abort                      # exactly back to the start

# 4. A rebase that went wrong and you already finished it.
$ git reflog                              # look for "rebase (start)"
$ git reset --hard ORIG_HEAD              # Git saved the pre-rebase tip here

# 5. A commit from a detached HEAD, with no reflog entry.
$ git fsck --lost-found
dangling commit 7a8b9c0d1e2f...
$ git show 7a8b9c0                        # is this the one?
$ git branch recovered 7a8b9c0

# 6. A file you deleted and committed, several commits ago.
$ git log --oneline --diff-filter=D -- path/to/file.js   # which commit deleted it
$ git checkout <commit-before-that>^ -- path/to/file.js

# 7. Stashed work you then dropped.
$ git fsck --unreachable | grep commit
$ git stash list                           # if it is still there
$ git stash apply <sha>                    # dropped stashes are dangling commits
```

`ORIG_HEAD` in case 4 is worth remembering on its own: Git writes it before any operation
that moves HEAD significantly — merge, rebase, reset, pull. It is a one-deep undo that
costs nothing to try.

:::realworld
The two most common real situations, in full:

```bash
# "I rebased onto the wrong branch and pushed."
$ git reflog
$ git reset --hard ORIG_HEAD               # back to pre-rebase
$ git push --force-with-lease              # restore the remote
# Tell your colleagues before they pull, because their clones may already
# have the bad version.

# "I committed a secret and pushed it."
# IMPORTANT: this is not a recovery problem, it is an incident.
# 1. Rotate the credential. Immediately. Assume it is compromised.
# 2. Only then clean the history:
$ git filter-repo --invert-paths --path .env
$ git push --force-with-lease --all
```

That second one is worth being blunt about: **removing a secret from history does not
un-leak it.** It was on a remote, in CI logs, in anyone's clone, and possibly in GitHub's
cached views. Rewriting history is cleanup, not remediation. The credential must be
rotated, and the order matters — rotate first, because the rewrite takes time and the key is
live the whole while.
:::

:::failure
**What genuinely cannot be recovered**, so you know where the real edge is:

```bash
# Never committed, so never in a ref, so not in the reflog:
$ git reset --hard                    # discarded working-tree changes
$ git checkout -- file.js             # discarded one file
$ git restore file.js                 # same thing, modern spelling
$ git clean -fd                       # deleted untracked files
$ git stash drop                       # recoverable via fsck, briefly

# Reflog explicitly destroyed:
$ git reflog expire --expire=now --all && git gc --prune=now
```

The pattern is clear: **Git protects commits, not your working tree.** Everything that
reached a commit object is recoverable for weeks; everything that did not is gone the
moment you discard it.

Which gives one habit worth more than all the recovery commands:

```bash
# Before anything you are unsure about:
$ git stash push -m "before trying the rebase"
# Stash creates real commit objects, so it is in the object store and
# recoverable even if you drop it.
```
:::

:::internals
**How long you have.** Unreachable objects are not deleted until `git gc` prunes them, and
`gc` respects the reflog's expiry settings:

```bash
$ git config --get gc.reflogExpire              # default: 90 days
$ git config --get gc.reflogExpireUnreachable   # default: 30 days
$ git config --get gc.pruneExpire               # default: 2 weeks

# So, practically:
#   reachable from a ref                 → forever
#   orphaned but in the reflog           → 30 days (90 if reachable)
#   orphaned with no reflog entry        → ~2 weeks
```

`gc` also runs automatically — `git gc --auto` is triggered by common commands once enough
loose objects accumulate. So you cannot assume nothing has been pruned just because you
never ran it by hand.

```bash
# See what is currently unreachable, before it is pruned:
$ git fsck --unreachable --no-reflogs
# Give yourself more room on a repository you care about:
$ git config gc.reflogExpireUnreachable 180.days
```

The honest summary: **you have weeks, not months, and the clock is not visible.** Recovery
is something to do now rather than when you next remember.
:::

:::mistakes
**Assuming the reflog is shared.** It is in `.git/logs/`, per-clone, and never pushed. If
you reset and then delete the clone, the reflog goes with it. A colleague has their own
reflog, recording their own operations — which is often still useful, because their clone
may hold the commits you lost.

**Running `gc --prune=now` to "clean up" after a mistake.** That is the one command that
closes the recovery window immediately. Leave `gc` alone until you are certain.

**Using `git checkout <sha> -- file` and expecting the branch to move.** It does not. That
restores a file into your working tree and index; HEAD and the branch are untouched. Which
is usually exactly what you want for case 6 above.

**Forgetting `git fsck` when the reflog has nothing.** Commits made on a detached HEAD, or
in a stash you dropped, may have no reflog entry at all and still be sitting in the object
store as dangling commits.
:::

:::tradeoffs
**Git's safety model** is unusually generous: it is append-only in practice, so almost every
destructive-sounding command is reversible, and `--force-with-lease` and `ORIG_HEAD` exist
specifically to make mistakes cheap.

The cost is discoverability. The reflog is invisible unless you know to ask for it, the
expiry windows are implicit, and `gc` runs on its own. So the safety exists and does not
announce itself — which is why people re-clone.

The reasonable response is not to memorise all of this. It is to know two things: **`git
reflog` is where you look**, and **`git stash` before anything uncertain**, because stash
turns working-tree changes — the only genuinely fragile thing — into commits.
:::

:::checkpoint
Do this in a scratch repository, now, so it is familiar rather than theoretical:

```bash
git init recovery-practice && cd recovery-practice
echo a > f && git add . && git commit -m "a"
echo b > f && git commit -am "b"
echo c > f && git commit -am "c"

git reset --hard HEAD~2      # "lose" two commits
git log --oneline            # they are gone from history
# now get them back
```

Then: make a commit on a detached HEAD, switch away, and recover it *without* using the
reflog. Which command finds it?
:::

:::interview
Recovery questions are a good practical signal because they separate people who have broken
something and fixed it from people who have only read about Git.

For "you reset by mistake": *"`git reflog` to find where the branch was, then
`git reset --hard` to that entry — or `ORIG_HEAD`, which Git writes before any operation
that moves HEAD. I would create a branch at the old tip first rather than resetting
immediately, so nothing further is destroyed while I check."*

Then the distinction that shows real understanding: *"the reflog covers anything that was
ever committed, for weeks. What it cannot recover is uncommitted work discarded by
`reset --hard` or `clean -fd`, because that was never in a ref. Which is why I stash before
anything uncertain — stash makes real commits."*

If it comes up in a secrets context, be clear about the ordering: *"rewriting history does
not un-leak a credential — it was already on the remote and in CI logs. Rotate first, clean
up second."*
:::

## What you now know

- `git log` walks the current history; the reflog journals where refs have *been*. Recovery
  needs the second.
- `git reset --hard HEAD@{1}` or `ORIG_HEAD` undoes a bad reset, rebase or merge.
- `git fsck --lost-found` finds commits with no reflog entry — detached-HEAD work, dropped
  stashes.
- Create a branch at the recovered commit before resetting anything.
- Git protects commits, not your working tree. `reset --hard` on uncommitted changes and
  `clean -fd` are the real losses.
- `git stash` before anything uncertain, because it turns fragile working-tree state into
  commit objects.
- The window is weeks, `gc` runs automatically, and the reflog is local and never pushed.
