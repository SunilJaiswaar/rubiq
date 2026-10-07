/**
 * Client-side search over a build-time inverted index.
 *
 * Scoring is BM25 with field weights. The index and this file share one tokeniser
 * (`tokenize.mjs`) so that what was indexed is what gets looked up.
 *
 * Why hand-rolled rather than a library: the whole index for this curriculum is small,
 * the query shapes are known, and shipping a search dependency to every visitor costs
 * more than the ~120 lines below. If the curriculum grows past a few thousand lessons
 * this should be revisited — the interface here would not change.
 */
import { tokenize, FIELD_WEIGHTS, FIELD_BY_ID, type SearchField } from './tokenize.mjs'

export interface IndexedDoc {
  id: string
  title: string
  summary: string
  route: string
  track: string
  level: string
  minutes: number
  blocks: string[]
}

type Posting = [docIdx: number, fieldId: number, tf: number]

export interface SearchIndex {
  docs: IndexedDoc[]
  postings: Record<string, Posting[]>
  avgLength: number
}

export interface SearchHit {
  doc: IndexedDoc
  score: number
  /** Which query terms matched, and where. Used to explain the result. */
  matchedTerms: string[]
  matchedFields: SearchField[]
}

const K1 = 1.2
const B = 0.6

export class SearchEngine {
  #index: SearchIndex
  #terms: string[]

  constructor(index: SearchIndex) {
    this.#index = index
    this.#terms = Object.keys(index.postings)
  }

  get size(): number {
    return this.#index.docs.length
  }

  /**
   * @param query raw user input, e.g. "why does Redis use memory?"
   * @param opts.limit max hits
   * @param opts.track restrict to one track
   */
  search(query: string, opts: { limit?: number; track?: string } = {}): SearchHit[] {
    const limit = opts.limit ?? 20
    const queryTerms = tokenize(query)
    if (queryTerms.length === 0) return []

    const N = this.#index.docs.length
    const scores = new Map<number, number>()
    const matchedTerms = new Map<number, Set<string>>()
    const matchedFields = new Map<number, Set<SearchField>>()

    queryTerms.forEach((term, termIdx) => {
      // The last term gets prefix expansion so results appear while still typing.
      const isLast = termIdx === queryTerms.length - 1
      const variants = this.#expand(term, isLast)

      for (const { token, penalty } of variants) {
        const postings = this.#index.postings[token]
        if (!postings) continue

        const df = new Set(postings.map((p) => p[0])).size
        // BM25 IDF, floored so a term present in every document still contributes.
        const idf = Math.max(0.05, Math.log(1 + (N - df + 0.5) / (df + 0.5)))

        for (const [docIdx, fieldId, tf] of postings) {
          const doc = this.#index.docs[docIdx]
          if (!doc) continue
          if (opts.track && doc.track !== opts.track) continue

          const field = FIELD_BY_ID[fieldId] ?? 'body'
          const weight = FIELD_WEIGHTS[field]
          const norm = 1 - B + B * (1 / Math.max(0.2, this.#index.avgLength / 400))
          const tfComponent = (tf * (K1 + 1)) / (tf + K1 * norm)

          scores.set(docIdx, (scores.get(docIdx) ?? 0) + idf * tfComponent * weight * penalty)

          if (!matchedTerms.has(docIdx)) matchedTerms.set(docIdx, new Set())
          if (!matchedFields.has(docIdx)) matchedFields.set(docIdx, new Set())
          matchedTerms.get(docIdx)?.add(term)
          matchedFields.get(docIdx)?.add(field)
        }
      }
    })

    // Reward documents that matched more of the query. Without this, a long lesson
    // mentioning "redis" fifty times beats the lesson actually about "redis memory".
    for (const [docIdx, score] of scores) {
      const coverage = (matchedTerms.get(docIdx)?.size ?? 1) / queryTerms.length
      scores.set(docIdx, score * (0.35 + 0.65 * coverage))
    }

    return [...scores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .flatMap(([docIdx, score]) => {
        const doc = this.#index.docs[docIdx]
        if (!doc) return []
        return [{
          doc,
          score,
          matchedTerms: [...(matchedTerms.get(docIdx) ?? [])],
          matchedFields: [...(matchedFields.get(docIdx) ?? [])],
        }]
      })
  }

  /** Exact term, plus prefix matches for the term being typed. */
  #expand(term: string, allowPrefix: boolean): Array<{ token: string; penalty: number }> {
    const out = [{ token: term, penalty: 1 }]
    if (!allowPrefix || term.length < 3) return out
    let added = 0
    for (const candidate of this.#terms) {
      if (added >= 12) break
      if (candidate !== term && candidate.startsWith(term)) {
        // Longer completions are weaker evidence than the typed prefix itself.
        out.push({ token: candidate, penalty: 0.45 * (term.length / candidate.length) })
        added++
      }
    }
    return out
  }

  /** Query suggestions for the search box, from indexed terms. */
  suggest(prefix: string, limit = 6): string[] {
    const [term] = tokenize(prefix)
    if (!term || term.length < 2) return []
    return this.#terms
      .filter((t) => t.startsWith(term))
      .sort((a, b) => {
        const aLen = this.#index.postings[a]?.length ?? 0
        const bLen = this.#index.postings[b]?.length ?? 0
        return bLen - aLen || a.localeCompare(b)
      })
      .slice(0, limit)
  }
}

let enginePromise: Promise<SearchEngine> | null = null

/** The index is fetched on first search, never on first page load. */
export function loadSearchEngine(): Promise<SearchEngine> {
  enginePromise ??= import('~generated/search-index.json').then(
    (m) => new SearchEngine(m.default as unknown as SearchIndex),
  )
  return enginePromise
}
