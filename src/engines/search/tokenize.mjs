/**
 * Tokeniser shared by the build-time index writer and the runtime query parser.
 *
 * It lives here, as plain ESM, specifically so there is exactly ONE implementation.
 * If indexing and querying tokenised differently, search would silently miss results —
 * the classic way a hand-rolled search index rots.
 */

// Dropped from queries and documents alike. Kept deliberately small: a learner
// searching "how does GC work" should still match on "gc" and "work".
const STOPWORDS = new Set([
  'a','an','and','are','as','at','be','but','by','can','do','does','for','from','had','has',
  'have','how','i','if','in','into','is','it','its','me','my','of','on','or','so','that','the',
  'their','then','there','these','they','this','to','was','were','what','when','where','which',
  'who','why','will','with','you','your','about','would','should','could','just','like','get',
])

// Pairs that mean the same thing to a learner but tokenise differently.
const SYNONYMS = new Map([
  ['js', 'javascript'], ['ts', 'typescript'], ['rb', 'ruby'], ['py', 'python'],
  ['postgres', 'postgresql'], ['pg', 'postgresql'], ['db', 'database'],
  ['perf', 'performance'], ['gc', 'garbagecollection'], ['oop', 'objectoriented'],
  ['dsa', 'algorithms'], ['async', 'asynchronous'], ['auth', 'authentication'],
  ['n+1', 'nplusone'], ['n1', 'nplusone'],
])

/**
 * Very small English stemmer: enough to unify plurals and common verb endings so that
 * searching "indexing" finds a lesson titled "Indexes".
 *
 * Deliberately not a full Porter stemmer — over-stemming conflates distinct technical
 * terms, which is worse here than missing a plural. The rules are ordered because
 * `-ies` and `-xes` must be tried before the bare `-s`.
 */
export function stem(word) {
  let w = word

  // queries → query, but not "ties" → "ty"
  if (w.length > 4 && w.endsWith('ies')) return w.slice(0, -3) + 'y'

  // Plurals formed with -es rather than -s: indexes → index, classes → class,
  // boxes → box, churches → church. Stripping only the 's' would leave "indexe",
  // which would never match "index".
  if (w.length > 4 && /(x|s|z|ch|sh)es$/.test(w)) return w.slice(0, -2)

  // Plain plural, protecting -ss (class) and -us (status).
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us')) {
    w = w.slice(0, -1)
  }

  if (w.length > 5 && w.endsWith('ing')) return w.slice(0, -3)
  if (w.length > 4 && w.endsWith('ed')) return w.slice(0, -2)
  return w
}

/**
 * @param {string} input
 * @param {{ keepStopwords?: boolean }} [opts]
 * @returns {string[]}
 */
export function tokenize(input, opts = {}) {
  if (!input) return []
  const lowered = input.toLowerCase()
  // Keep +, #, and . inside tokens so "c++", "c#", "n+1" and "3.2" survive.
  const raw = lowered.match(/[a-z0-9][a-z0-9+#._-]*/g) ?? []
  const out = []
  for (const token of raw) {
    const trimmed = token.replace(/[._-]+$/, '')
    if (!trimmed || trimmed.length > 40) continue
    if (!opts.keepStopwords && STOPWORDS.has(trimmed)) continue
    const canonical = SYNONYMS.get(trimmed) ?? trimmed
    if (canonical.length === 1 && !/[0-9]/.test(canonical)) continue
    out.push(stem(canonical))
  }
  return out
}

/** Field weights. A title hit should outrank a passing mention in prose. */
export const FIELD_WEIGHTS = { title: 8, heading: 4, tag: 3, summary: 3, body: 1 }
export const FIELD_IDS = { title: 0, heading: 1, tag: 2, summary: 3, body: 4 }
export const FIELD_BY_ID = ['title', 'heading', 'tag', 'summary', 'body']
