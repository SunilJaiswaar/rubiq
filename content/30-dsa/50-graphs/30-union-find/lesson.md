---
title: Union-find
summary: Answering "are these two connected" in effectively constant time, with twenty lines of code and two optimisations that are each one line.
level: advanced
minutes: 16
version: "1"
status: stable
last_reviewed: "2026-10-07"
tags: [dsa, union-find, disjoint-set, kruskal, amortised]
concepts: [union-find, path-compression, amortised-analysis, connectivity]
prerequisites: [graphs, trees]
interview:
  - question: What problem does union-find solve, and why not just use BFS?
    level: advanced
    answer: >-
      It answers "are a and b in the same connected component" and "merge these two components",
      both in effectively constant time, under a stream of merges. BFS answers connectivity in
      O(V + E) per query, which is fine for one question and hopeless for a million interleaved
      with edges being added. The structure's whole purpose is the incremental case: it maintains
      the component partition as edges arrive, rather than recomputing it. The trade is that it
      cannot give you the path, only the answer, and it cannot handle deletions.
    followUps:
      - "What makes it effectively constant rather than logarithmic?"
  - question: What are the two optimisations, and what does each fix?
    level: advanced
    answer: >-
      Path compression, in find: after walking to the root, point every node on that path
      directly at it, so the next query is one step. Union by rank or size, in union: attach the
      smaller tree under the larger, so the tree never becomes a chain. Each alone gives O(log
      n); together they give O(α(n)) amortised, where α is the inverse Ackermann function and is
      below 5 for any n you will ever have. The reason both are needed is that compression fixes
      paths you have already walked, while union by size prevents creating deep paths in the
      first place.
    followUps:
      - "Why is the inverse Ackermann function the answer?"
  - question: Where would you actually use it?
    level: advanced
    answer: >-
      Kruskal's minimum spanning tree, where it answers "would this edge create a cycle" for
      every edge in sorted order. Incremental connectivity in a network or a dependency graph.
      Detecting cycles in an undirected graph as edges are added. Grouping — merging duplicate
      accounts, clustering, flood fill on a grid, and connected-component labelling in images.
      The common shape is "I keep being told two things are the same, and I keep being asked
      whether two things are the same".
    followUps:
      - "Why can it not handle removing an edge?"
resources:
  - title: "Sedgewick & Wayne — Union-Find"
    url: https://algs4.cs.princeton.edu/15uf/
---

## Twenty lines

```js
class UnionFind {
  #parent; #size; #count;

  constructor(n) {
    this.#parent = Array.from({ length: n }, (_, i) => i);   // each its own root
    this.#size = new Array(n).fill(1);
    this.#count = n;                                          // components
  }

  find(x) {
    while (this.#parent[x] !== x) {
      this.#parent[x] = this.#parent[this.#parent[x]];   // path halving
      x = this.#parent[x];
    }
    return x;
  }

  union(a, b) {
    let ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;                         // already together
    if (this.#size[ra] < this.#size[rb]) [ra, rb] = [rb, ra];   // by size
    this.#parent[rb] = ra;
    this.#size[ra] += this.#size[rb];
    this.#count--;
    return true;
  }

  connected(a, b) { return this.find(a) === this.find(b); }
  get components() { return this.#count; }
}
```

:::what
A **disjoint-set** (union-find) structure maintains a partition of elements into disjoint sets.
`find(x)` returns a representative of x's set; `union(a, b)` merges two sets. Each set is stored
as a tree whose root is the representative, held in a flat parent array.
:::

:::why
The structure exists for the *incremental* version of connectivity, and that distinction is
easy to miss.

If you are handed a finished graph and asked which nodes are connected, BFS or DFS answers it
once in O(V + E) and you are done. The problem union-find solves is different: edges arrive one
at a time, and between arrivals you must answer connectivity questions. Recomputing components
after every edge is O(E) per edge, so O(E²) overall — on a million edges that is a trillion
operations.

Union-find maintains the answer instead of recomputing it. Each new edge is a merge, each
question is two lookups, and both are effectively constant.

The reason it can be so fast is that it throws away almost everything. It does not know the
path between two connected nodes, cannot enumerate a component's members without scanning, and
cannot undo a merge. All it maintains is the partition — exactly the thing being asked about,
and nothing else. That is the same principle as the heap keeping only the extreme, and it is
why the implementation is twenty lines: there is very little to store.
:::

:::how
```text
  THE FOREST

    parent: [0, 0, 1, 3, 3]

      0        3
      │       / \
      1      ?   4
      │
      2

    find(2) walks 2 → 1 → 0 and returns 0.
    find(4) walks 4 → 3 and returns 3.
    connected(2, 4) → 0 !== 3 → false.

  PATH COMPRESSION — fix the path you just walked

    before find(2):        after find(2) with full compression:

      0                      0
      │                     /|\
      1                    1 2 (and anything else on the path)
      │
      2

    The next find(2) is one step. The cost of walking the path is
    paid once and amortised over every future query through it.

  UNION BY SIZE — never create the chain in the first place

    Attaching the LARGER tree under the smaller doubles the depth of
    the larger tree's nodes, which is the many; attaching the smaller
    under the larger deepens only the few.

    Without it, unioning in a bad order gives:
      0 → 1 → 2 → 3 → ... → n        a linked list. find is O(n).

    With it, depth is O(log n) even before compression, because a
    tree only deepens when two trees of equal size merge, and that
    can happen at most log n times.

  WHY BOTH

    compression alone:   O(log n) amortised
    union by size alone: O(log n) worst case
    both:                O(α(n)) amortised

    They attack different things. Compression repairs paths after the
    fact; union by size avoids creating deep ones. Neither subsumes
    the other.

  α(n) — the inverse Ackermann function

    α(n) < 5 for every n below 2^2^2^2^65536.

    So "effectively constant" is not hand-waving: it is constant for
    every input that can exist. It is NOT actually O(1) — Tarjan
    proved the α bound is tight — but the distinction has no
    practical consequence.
```
:::

:::example
```js
// 1. Kruskal's minimum spanning tree. Union-find is what makes it work.
function kruskal(n, edges) {
  // edges: [weight, u, v]
  edges.sort((a, b) => a[0] - b[0]);
  const uf = new UnionFind(n);
  const tree = [];
  let total = 0;

  for (const [w, u, v] of edges) {
    if (uf.union(u, v)) {        // returns false if already connected
      tree.push([u, v, w]);      // → adding this edge would make a cycle
      total += w;
      if (tree.length === n - 1) break;    // a spanning tree has n-1 edges
    }
  }
  return uf.components === 1 ? { tree, total } : null;   // null = disconnected
}
// The greedy claim: taking the cheapest edge that does not create a
// cycle is always safe. Union-find is precisely the cycle test, and it
// is why the algorithm is O(E log E) — dominated by the sort, not by
// the connectivity work.

// 2. Cycle detection in an UNDIRECTED graph, as edges arrive.
function hasCycle(n, edges) {
  const uf = new UnionFind(n);
  for (const [u, v] of edges) {
    if (!uf.union(u, v)) return true;   // endpoints already connected
  }
  return false;
}
// Compare this with the DFS version from the traversal lesson: DFS
// needs the whole graph up front and a parent check; this works on a
// stream and is three lines.

// 3. Counting islands on a grid — union-find as a grouping tool.
function countIslands(grid) {
  const rows = grid.length, cols = grid[0].length;
  const uf = new UnionFind(rows * cols);
  const id = (r, c) => r * cols + c;
  let land = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid[r][c] !== 1) continue;
      land++;
      // Only look up and left — every pair gets considered once.
      if (r > 0 && grid[r - 1][c] === 1 && uf.union(id(r, c), id(r - 1, c))) land--;
      if (c > 0 && grid[r][c - 1] === 1 && uf.union(id(r, c), id(r, c - 1))) land--;
    }
  }
  return land;
}
// Counting by decrementing on each successful union is neater than
// counting roots afterwards, and avoids a second pass. Note that only
// two of the four neighbours are checked: looking in all four
// directions does the same unions twice.
```
:::

:::failure
**No union by size.** Unioning in order 0-1, 0-2, 0-3 the wrong way round builds a chain:

```js
// A naive union that always attaches ra under rb:
this.#parent[ra] = rb;
// With a particular input order this produces depth n, so find is
// O(n) and the whole structure is no better than a linked list.
```

**No path compression.** Correct, and each query re-walks the full path. The difference on a
million operations is roughly log n versus 1 — not catastrophic, and entirely avoidable by one
line.

**Comparing elements instead of roots.**

```js
if (a === b) return;                    // wrong: compares the elements
if (this.find(a) === this.find(b)) ...  // correct: compares the sets
```

**Caching a root.** A root is only a root until something merges into it:

```js
const root = uf.find(5);
uf.union(5, 9);
// `root` may no longer be 5's representative. Always call find.
```

**Expecting deletion.** You cannot remove an edge. The structure records that two things became
the same and keeps no history of why, so there is nothing to undo. Dynamic connectivity with
deletions needs a genuinely different structure — Euler tour trees or link-cut trees — and is
far more complex. If your problem has removals, union-find is the wrong tool and the way to find
out should not be in production.

**Expecting to enumerate a component.** `find` gives a representative, not members. If you need
the members, maintain a separate map from root to list — and remember to merge those lists on
union, which is the part people forget.

**Using it for a *directed* graph's connectivity.** Union-find models an undirected equivalence
relation: if a connects to b then b connects to a. Directed reachability is not symmetric, so
union-find cannot express it. Strongly connected components need Tarjan's or Kosaraju's
algorithm.
:::

:::realworld
```text
// Where it shows up.

  Kruskal's MST            — network design, clustering, image
                              segmentation.
  Percolation / flood fill  — "is there a path from top to bottom",
                              which is the original motivating problem.
  Connected-component       — computer vision, labelling regions in a
  labelling                   binary image.
  Account merging           — "these two identities are the same
                              person", applied repeatedly from
                              different signals.
  Equivalence in compilers  — type unification in Hindley-Milner
                              inference is union-find over type
                              variables, which is why it is fast.
  Dynamic connectivity      — social graph "are these in the same
                              cluster" without a traversal.
  Kruskal-style clustering  — single-linkage hierarchical clustering
                              is literally Kruskal stopped early.
  Grid and maze generation  — knock down a wall if it joins two
                              distinct regions.
```

```js
// Account merging — the shape that recurs in production work.
function mergeAccounts(signals, userCount) {
  // signals: pairs of user ids that some heuristic says are the same
  const uf = new UnionFind(userCount);
  for (const [a, b] of signals) uf.union(a, b);

  // Group by representative. Maintaining this during the unions is
  // possible, and doing it once at the end is simpler and usually fine.
  const groups = new Map();
  for (let i = 0; i < userCount; i++) {
    const root = uf.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(i);
  }
  return [...groups.values()];
}
// The property that makes union-find right here: the signals arrive
// from independent sources in no particular order, and merges are
// transitive — if a=b from email and b=c from device id, then a=c.
// Transitive closure of an equivalence relation is exactly what this
// structure is.
//
// And the property that should worry you: it is irreversible. A bad
// merge signal permanently joins two real users, and there is no undo.
// In production that means keeping the raw signals so the partition
// can be rebuilt from scratch without the bad one — the structure
// itself cannot help you.
```
:::

:::mistakes
**Omitting union by size.** O(n) finds in the worst order.

**Omitting path compression.** O(log n) instead of effectively constant, for one line.

**Comparing elements rather than roots.**

**Caching a `find` result across a `union`.**

**Expecting to delete.** Not supported, and not patchable.

**Expecting to list a component's members.** Keep a separate structure, and merge it on union.

**Using it for directed reachability.** It models an equivalence relation only.

**Forgetting that merges are irreversible** when the merge signals are heuristic. Keep the
inputs so you can rebuild.

**Initialising with the wrong size.** `new UnionFind(n)` where ids run 1..n gives an
out-of-bounds or a phantom extra component. Off-by-one here produces a wrong count, not a
crash.
:::

:::tradeoffs
**BFS/DFS per query** — O(V + E) per question, no preprocessing, and it gives you the path.
Right for a one-off question or when you need the route.

**Union-find** — effectively O(1) per operation, twenty lines, handles edges arriving
incrementally. Gives no path, no component enumeration, and no deletions.

**Adjacency matrix transitive closure** — O(V³) to precompute with Floyd-Warshall, then O(1)
queries including for directed graphs. Right for small dense graphs where you need directed
reachability.

**Link-cut trees / Euler tour trees** — support deletion, which union-find cannot, at the cost
of a large increase in complexity. Reach for these only when removals are genuinely required.

**Maintaining explicit component sets** — gives you membership lists, costs O(n) in the worst
case per union unless you always merge the smaller into the larger — which is the same
small-to-large trick, and gives O(n log n) total.

The recognition rule: **"are these the same group" plus "these two are now the same group",
repeatedly → union-find.** If you also need the path, the members, or removals, it is the wrong
structure and the right one is considerably more work.
:::

:::checkpoint
1. Why not just run BFS for each connectivity query? Give the complexity of both over a
   million interleaved operations.
2. What does path compression fix, and what does union by size fix? Why is neither enough
   alone?
3. What is α(n), and what does "effectively constant" precisely mean here?
4. In Kruskal's, what question is `union` answering, and what does its return value mean?
5. Why can union-find not support edge deletion?
6. Why does `countIslands` only check up and left?
7. Why can union-find not answer directed reachability?
8. A heuristic merges two accounts wrongly. What can the structure do about it?
:::

:::interview
Frame it as the incremental problem, because that is what justifies its existence:

*"It maintains a partition under merges: 'are these two in the same set' and 'merge these sets',
both effectively constant. The reason not to use BFS is that BFS is O(V + E) per query and
recomputes from scratch — fine once, hopeless when edges arrive one at a time and you are asked
connectivity between them. A million interleaved operations is O(E²) with recomputation and
effectively linear with union-find."*

Name both optimisations with what each fixes, since that pairing is the real question:

*"Path compression repoints every node on the path directly at the root after a find, so the
cost of walking it is paid once. Union by size attaches the smaller tree under the larger, so a
tree only deepens when two equal-sized trees merge, which can happen at most log n times. They
address different things — compression repairs paths already walked, union by size avoids
creating deep ones — so each alone gives O(log n) and together they give O(α(n)), which is below
5 for any n that can exist."*

Then the limits, which is what makes the answer complete:

*"What it gives up is everything except the partition: no path between connected nodes, no way to
enumerate a component without scanning, and no deletions — it records that two things became the
same and keeps no history of why. So if the problem involves removing edges, it is the wrong
structure and the right one is link-cut trees, which is a large step up in complexity. And in
production, when the merge signals are heuristic, I keep the raw signals, because a bad merge is
permanent and the only remedy is rebuilding the partition without it."*
:::

## What you now know

- Union-find maintains a partition under merges in effectively constant time.
- It exists for the incremental case; BFS is fine for a one-off query.
- Each set is a tree in a flat parent array; the root is the representative.
- Path compression repoints the walked path at the root — one line, fixes past paths.
- Union by size attaches smaller under larger — one line, prevents deep paths.
- Each alone gives O(log n); together O(α(n)), which is under 5 for any real n.
- Compare roots, never elements, and never cache a root across a union.
- In Kruskal's, `union` returning false *is* the cycle test.
- It cannot delete edges; dynamic connectivity needs link-cut trees.
- It cannot enumerate a component or give a path — only answer the partition question.
- It models an undirected equivalence relation, so directed reachability needs Tarjan's.
- Merges are irreversible; keep the raw signals so the partition can be rebuilt.
