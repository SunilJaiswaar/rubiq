import { describe, it, expect } from 'vitest'
import { SearchEngine, type SearchIndex, type IndexedDoc } from './index'
import { tokenize, stem, FIELD_IDS } from './tokenize.mjs'

describe('tokenize', () => {
  it('lowercases and splits on punctuation', () => {
    expect(tokenize('Hello, World!')).toEqual(['hello', 'world'])
  })

  it('drops stopwords so natural questions work', () => {
    expect(tokenize('why does Redis use memory?')).toEqual(['redi', 'use', 'memory'])
  })

  it('keeps language names that contain punctuation', () => {
    expect(tokenize('C++ and C# basics')).toEqual(['c++', 'c#', 'basic'])
  })

  it('maps abbreviations onto their full form', () => {
    expect(tokenize('js')).toEqual(tokenize('javascript'))
    expect(tokenize('postgres')).toEqual(tokenize('postgresql'))
  })

  it('normalises the many spellings of an N+1 query', () => {
    expect(tokenize('n+1')).toEqual(tokenize('n1'))
  })

  it('drops single letters but keeps digits', () => {
    expect(tokenize('a 5')).toEqual(['5'])
  })

  it('returns nothing for empty or symbol-only input', () => {
    expect(tokenize('')).toEqual([])
    expect(tokenize('!!! ???')).toEqual([])
  })

  it('unifies plurals with their singular', () => {
    expect(tokenize('indexes')).toEqual(tokenize('index'))
    expect(tokenize('queries')).toEqual(tokenize('query'))
  })
})

describe('stem', () => {
  it('leaves short words alone', () => {
    expect(stem('gc')).toBe('gc')
    expect(stem('css')).toBe('css')
  })

  it('does not mangle words ending in -ss or -us', () => {
    expect(stem('class')).toBe('class')
    expect(stem('status')).toBe('status')
  })

  it('strips common verb endings', () => {
    expect(stem('caching')).toBe('cach')
    expect(stem('indexed')).toBe('index')
  })
})

/* --- a small index, hand-built so expectations are obvious --- */

const doc = (id: string, title: string, track = 'ruby'): IndexedDoc => ({
  id, title, summary: '', route: `/learn/${id}`, track, level: 'beginner', minutes: 5, blocks: [],
})

function buildIndex(
  entries: Array<{ doc: IndexedDoc; title: string; body: string; tags?: string }>,
): SearchIndex {
  const postings: SearchIndex['postings'] = {}
  entries.forEach((entry, docIdx) => {
    const fields: Array<[number, string]> = [
      [FIELD_IDS.title, entry.title],
      [FIELD_IDS.body, entry.body],
      [FIELD_IDS.tag, entry.tags ?? ''],
    ]
    for (const [fieldId, text] of fields) {
      const counts = new Map<string, number>()
      for (const t of tokenize(text)) counts.set(t, (counts.get(t) ?? 0) + 1)
      for (const [token, tf] of counts) (postings[token] ??= []).push([docIdx, fieldId, tf])
    }
  })
  return {
    docs: entries.map((e) => e.doc),
    postings,
    avgLength: entries.reduce((n, e) => n + tokenize(e.body).length, 0) / entries.length,
  }
}

const index = buildIndex([
  {
    doc: doc('redis/caching/memory', 'Why Redis keeps data in memory'),
    title: 'Why Redis keeps data in memory',
    body: 'Redis stores the keyspace in RAM because a disk seek costs milliseconds and a memory read costs nanoseconds. Memory is the whole point of Redis.',
    tags: 'redis memory caching',
  },
  {
    doc: doc('rails/performance/n-plus-one', 'The N+1 query problem'),
    title: 'The N+1 query problem',
    body: 'A loop that issues one query per record turns one page render into hundreds of database round trips. Rails calls the fix eager loading.',
    tags: 'rails activerecord performance',
  },
  {
    doc: doc('sql/indexes/btree', 'How a B-tree index works', 'sql'),
    title: 'How a B-tree index works',
    body: 'An index trades write cost and disk space for read speed. Without an index the database scans every row.',
    tags: 'sql index performance',
  },
  {
    doc: doc('networking/transport/tcp-udp', 'TCP versus UDP', 'networking'),
    title: 'TCP versus UDP',
    body: 'TCP guarantees ordered delivery by retransmitting lost segments. UDP does not, which is why video calls prefer it.',
    tags: 'networking tcp udp',
  },
])

const engine = new SearchEngine(index)

describe('SearchEngine', () => {
  it('finds a lesson by an exact title word', () => {
    expect(engine.search('redis')[0]?.doc.id).toBe('redis/caching/memory')
  })

  it('answers a natural-language question', () => {
    const hits = engine.search('why does Redis use memory?')
    expect(hits[0]?.doc.id).toBe('redis/caching/memory')
  })

  it('finds the N+1 lesson however the learner spells it', () => {
    for (const query of ['n+1 query', 'n1 queries', 'rails N+1']) {
      expect(engine.search(query)[0]?.doc.id).toBe('rails/performance/n-plus-one')
    }
  })

  it('handles "tcp vs udp"', () => {
    expect(engine.search('tcp vs udp')[0]?.doc.id).toBe('networking/transport/tcp-udp')
  })

  it('finds indexing by a stemmed plural', () => {
    expect(engine.search('postgresql indexing')[0]?.doc.id).toBe('sql/indexes/btree')
  })

  it('ranks a title match above a passing body mention', () => {
    const hits = engine.search('index')
    expect(hits[0]?.doc.id).toBe('sql/indexes/btree')
  })

  it('rewards covering more of the query', () => {
    // "database scans" appears in the B-tree lesson; "database" alone also appears
    // in the N+1 lesson. Matching both terms should win.
    const hits = engine.search('database scans every row')
    expect(hits[0]?.doc.id).toBe('sql/indexes/btree')
  })

  it('returns nothing for a query of only stopwords', () => {
    expect(engine.search('the and of')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(engine.search('')).toEqual([])
  })

  it('returns nothing rather than everything for a term that is absent', () => {
    expect(engine.search('kubernetes')).toEqual([])
  })

  it('restricts to a track when asked', () => {
    const hits = engine.search('performance', { track: 'sql' })
    expect(hits.every((h) => h.doc.track === 'sql')).toBe(true)
  })

  it('respects the limit', () => {
    expect(engine.search('performance', { limit: 1 })).toHaveLength(1)
  })

  it('matches a prefix on the final term, so results appear while typing', () => {
    expect(engine.search('redi')[0]?.doc.id).toBe('redis/caching/memory')
    expect(engine.search('netw')[0]?.doc.track).toBe('networking')
  })

  it('does not prefix-expand a non-final term', () => {
    // "mem" would prefix-match "memory", but it is not the last term here.
    const hits = engine.search('mem redis')
    expect(hits[0]?.doc.id).toBe('redis/caching/memory')
  })

  it('reports which terms and fields matched, so a result can explain itself', () => {
    const hit = engine.search('redis memory')[0]
    expect(hit?.matchedTerms.sort()).toEqual(['memory', 'redi'])
    expect(hit?.matchedFields).toContain('title')
  })

  it('orders results by descending score', () => {
    const scores = engine.search('performance index query').map((h) => h.score)
    expect([...scores].sort((a, b) => b - a)).toEqual(scores)
  })

  it('suggests completions ordered by how common the term is', () => {
    const suggestions = engine.suggest('re')
    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.every((s) => s.startsWith('re'))).toBe(true)
  })

  it('suggests nothing for a single character', () => {
    expect(engine.suggest('r')).toEqual([])
  })

  it('reports its size', () => {
    expect(engine.size).toBe(4)
  })
})
