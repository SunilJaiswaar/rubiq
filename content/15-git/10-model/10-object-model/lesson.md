---
title: What a commit actually is
summary: Git is a content-addressed store with four object types. Everything else follows from that.
level: beginner
minutes: 15
status: stable
last_reviewed: "2026-10-07"
tags: [git, commits, hashing]
concepts: [git-objects, content-addressing, commit-graph]
prerequisites: []
interview:
  - question: What does a Git commit contain?
    level: basic
    answer: >-
      A commit is a small text object holding: a pointer to one tree (the complete
      snapshot of the project at that moment), pointers to its parent commits, the author
      and committer with timestamps, and the message. Its name is the SHA of that content.
      Notably it does *not* contain a diff — diffs are computed on demand by comparing two
      trees. That is why `git log -p` is slower than `git log`.
    followUps:
      - "So how does Git store a hundred versions of a large file without a hundred copies?"
      - "If the hash covers the parent, what happens to every later commit when you amend one?"
  - question: Why does rewriting history change every subsequent commit hash?
    level: intermediate
    answer: >-
      Because a commit's hash is computed over its content, and that content includes its
      parent's hash. Change anything about a commit — the message, the tree, the author —
      and its hash changes; its child's content now references a different parent, so the
      child's hash changes too, and so on to the tip. It is a hash chain, which is also
      why history is tamper-evident: you cannot alter an old commit without every
      descendant visibly changing.
resources:
  - title: "Pro Git — Git Objects"
    url: https://git-scm.com/book/en/v2/Git-Internals-Git-Objects
---

## The question that makes Git make sense

Most people learn Git as a list of commands. Then one day they need `git reset --hard`
versus `--soft`, or they rebase and lose work, and the list does not help — because a list
of commands has no model behind it.

So: **what is actually in a commit?**

:::problem
The intuitive answer is "the changes I made". That model predicts that Git stores a chain
of diffs and applies them in order.

It is wrong, and it predicts the wrong behaviour for almost every interesting command. If
commits were diffs, `git checkout` of an old commit would mean replaying thousands of
patches. It is instant instead.
:::

:::what
Git is a **content-addressed object store**. It holds four kinds of object, each named by
the SHA-1 (now SHA-256) of its own contents:

| Object | Holds |
|---|---|
| **blob** | the bytes of one file. No name, no permissions — just content |
| **tree** | a directory listing: names, modes, and the hash of each entry |
| **commit** | one tree hash, parent commit hashes, author, committer, message |
| **tag** | an annotated pointer to another object |

A **commit is a snapshot**, not a diff.
:::

:::how
```text
  A repository with  README.md  and  src/app.js

   commit  a1b2c3
   ┌─────────────────────────────┐
   │ tree    d4e5f6              │────┐
   │ parent  9f8e7d              │    │
   │ author  Asha <a@b.c> 17...  │    │
   │                             │    │
   │ Add the app entry point     │    │
   └─────────────────────────────┘    │
                                      ▼
                        tree d4e5f6
                        ┌──────────────────────────────────┐
                        │ 100644 blob 1111aa   README.md   │──▶ blob 1111aa
                        │ 040000 tree 2222bb   src         │     "# My project…"
                        └──────────────────────────────────┘
                                      │
                                      ▼
                        tree 2222bb
                        ┌──────────────────────────────────┐
                        │ 100644 blob 3333cc   app.js      │──▶ blob 3333cc
                        └──────────────────────────────────┘     "console.log(1)"
```

Three consequences fall straight out of this picture, and they are most of what you need:

1. **Checkout is cheap.** The commit names a tree; the tree names everything. No replay.
2. **Identical content is stored once.** The blob is named by its hash, so the same file
   in a thousand commits is one blob. Rename a file and the blob does not change at all —
   only the tree entry does. This is why Git does not "track renames": it does not have
   to.
3. **History is a hash chain.** The commit's hash covers its parent's hash.
:::

:::why
Content addressing is the whole design. Naming an object by the hash of its content gives
you deduplication, integrity checking and distribution for free — two repositories can
compare state by exchanging hashes, with no central authority deciding what version 7 is.

That last point is why Git is distributed and Subversion is not. It is not a feature bolted
on; it is a consequence of how objects are named.
:::

## Looking at the real thing

Every one of these works in any repository, and they are the fastest way to make this
concrete:

```bash
# The commit object, verbatim. This is the whole thing.
$ git cat-file -p HEAD
tree 9c5c64c4d1b0e8ba05a0bcbe9c7f3fa15b3f77a9
parent 7e2fa4d3a2c18f1f9b3b3ab0b92a2d9b8a1b5c6d
author  Asha <asha@example.com> 1767225600 +0530
committer Asha <asha@example.com> 1767225600 +0530

Add pricing rules

# The tree it points at — a directory listing.
$ git cat-file -p HEAD^{tree}
100644 blob a4b2c1...    README.md
040000 tree 8e9f0a...    src

# A blob is just bytes.
$ git cat-file -p a4b2c1
# My project

# What type is this hash?
$ git cat-file -t HEAD        # commit

# Hash some content without storing it — proving the name IS the content.
$ echo "hello" | git hash-object --stdin
ce013625030ba8dba906f756967f9e9ca394464a

# That hash is the same in every Git repository on earth, forever.
```

:::internals
**So does Git really store a full copy of every file in every commit?**

Logically, yes — and that is what makes it fast. Physically, no.

Objects start as **loose objects**: one zlib-compressed file per object under
`.git/objects/`. Periodically — on `gc`, or when pushing — Git repacks them into a
**packfile**, where similar objects are stored as deltas against one another.

```text
  LOOSE                              PACKED
  .git/objects/                      .git/objects/pack/
    a4/b2c1...   (full, zlib)          pack-abc.pack
    8e/9f0a...   (full, zlib)            ├─ blob a4b2c1  full
    3c/1d2e...   (full, zlib)            ├─ blob 8e9f0a  delta vs a4b2c1
                                         └─ blob 3c1d2e  delta vs 8e9f0a
```

The crucial point: **the delta compression is a storage detail, not the data model.** Deltas
are chosen by similarity, not by commit order — a blob may be stored as a delta against a
version from fifty commits later. The object graph is unaffected, and nothing above the
storage layer knows or cares.

This is the opposite of Subversion and CVS, which modelled history *as* deltas and then
had to reconstruct snapshots. Git models snapshots and compresses them. Modelling the thing
you want and optimising the storage separately is the better order, and it is why Git's
branching is cheap while SVN's was painful.

```bash
# See it for yourself.
$ git count-objects -vH
count: 143            # loose
size: 1.21 MiB
in-pack: 8472         # packed
size-pack: 4.33 MiB   # 8472 objects in less space than 143 loose ones
```
:::

## The hash chain

```text
  A ◀── B ◀── C ◀── D           each arrow is "my parent is"
  │     │     │     │
  hash of each commit covers its parent's hash

  Amend B's message:

  A ◀── B' ◀── ?               B' has a different hash, so C's recorded parent
                                no longer exists. C must be rewritten as C',
                                which changes D to D'.

  A ◀── B' ◀── C' ◀── D'       four commits, three of them rewritten
```

:::realworld
This is why the practical rules about history are what they are:

- **`git commit --amend` rewrites.** It does not edit the commit; it creates a new one and
  moves the branch. The old commit still exists, unreferenced, until garbage collection.
- **Rebasing rewrites every commit it moves**, so pushing a rebased branch requires
  `--force`, because the remote's commits are no longer ancestors of yours.
- **Never rewrite shared history.** Not for etiquette — because your colleagues' commits
  reference parents that no longer exist, and their next pull produces a mess.
- **`git push --force-with-lease` instead of `--force`.** `--force` overwrites whatever is
  there. `--force-with-lease` first checks the remote is still where you last saw it, so it
  refuses if someone else pushed in the meantime. There is no good reason to use plain
  `--force` on a shared branch.
- **Signed commits work** because the signature covers the hash, which covers the whole
  history. You cannot alter an ancestor without invalidating every signature after it.
:::

:::mistakes
**Thinking a commit stores a diff.** It stores a tree. `git show` computes the diff on
demand by comparing your tree to your parent's. For a merge commit with two parents there
is no single obvious diff, which is why `git show` on a merge looks odd by default.

**Expecting Git to track renames.** It does not record them anywhere. `git log --follow`
and rename detection in diffs are *heuristics* run at display time, comparing blob
similarity. A rename plus heavy edits in one commit often will not be detected — and that
is not a bug, because the information was never stored.

**Assuming a short hash is permanent.** `a1b2c3d` is a prefix. It is unambiguous today and
can become ambiguous as the repository grows. Fine in a terminal, wrong in a script or a
changelog.

**Believing the hash covers the filename.** It does not. Blobs are content only — the name
lives in the tree. Two identical files in different directories are one blob.
:::

:::failure
**An unreferenced object is not immediately gone, but it is not safe either.**

When you amend or reset, the old commits become unreachable: no branch, tag or reflog entry
points to them. They still exist on disk. `git gc` deletes unreachable objects older than
the grace period — two weeks by default, and the reflog keeps them reachable for 90 days.

```bash
# After a bad reset, the commit is unreachable but recoverable:
$ git reflog                    # the reflog still has it
$ git fsck --lost-found         # or find it as a dangling commit

# This is what destroys it for good:
$ git reflog expire --expire=now --all && git gc --prune=now
```

So the practical model is: **rewriting history is reversible for about two weeks, then it
is not.** That is a generous safety net and not a guarantee. The time to look is now, not
next month.
:::

:::tradeoffs
**Snapshots plus content addressing.** Instant checkout of any commit, cryptographic
integrity, trivial deduplication, and distribution with no central authority.

Costs: every object must be hashed, so large binary files are expensive — a 100 MB file
changed ten times is ten 100 MB blobs that delta-compress badly. Git LFS exists entirely
for this. The full history is cloned, so a repository with a long binary history is slow to
clone forever, even after the files are deleted — the objects remain reachable from old
commits.

**Delta-based systems** (Subversion, CVS) store changes directly, so a small change is a
small amount of storage regardless of file size. Costs: reconstructing any version means
replaying, branching is expensive, and there is no integrity chain.

The honest summary: Git's design is excellent for text and poor for large binaries, and
that follows directly from content addressing rather than being an oversight.
:::

:::checkpoint
In any repository you have, run these and answer the questions:

```bash
git cat-file -p HEAD            # How many parents does it have? Why that many?
git cat-file -p HEAD^{tree}     # Is your largest file's name in here, or deeper?
git count-objects -vH           # What fraction of objects are packed?
echo "hello" | git hash-object --stdin
```

Then: create a file, commit it, delete it, commit again. Is the blob still in
`.git/objects`? Should it be? What would have to be true for it to be gone?
:::

:::interview
Git questions are a reliable seniority signal because most people know commands and few
know the model.

"What is in a commit?" — answer with the list and then the consequence that matters:
*"a tree, its parents, author and committer metadata, and the message. Not a diff — which
is why checkout is instant and why diffs are computed on demand."*

The follow-up is almost always about rewriting. The strong answer connects it back:
*"the hash covers the content including the parent hash, so it is a hash chain. Amending a
commit changes its hash, which orphans its child, which has to be rewritten too — so
rewriting one commit rewrites everything after it. That is why a rebased branch needs a
force push, and why force-pushing a shared branch breaks everyone's parent references."*

Then the detail that signals practical experience: *"and `--force-with-lease` rather than
`--force`, so it refuses if the remote moved since I last fetched."*
:::

## What you now know

- Git is a content-addressed store with four object types: blob, tree, commit, tag.
- A commit holds a tree, parents, metadata and a message — **not a diff**.
- Blobs are content only; names live in trees, which is why renames are free and untracked.
- Diffs and rename detection are computed at display time, heuristically.
- Delta compression in packfiles is a storage detail that the object model does not see.
- The hash covers the parent hash, making history a tamper-evident chain — and making any
  rewrite cascade to every descendant.
- Rewriting is recoverable via the reflog for weeks, not forever.
