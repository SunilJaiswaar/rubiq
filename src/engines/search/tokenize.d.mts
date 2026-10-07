export type SearchField = 'title' | 'heading' | 'tag' | 'summary' | 'body'
export function stem(word: string): string
export function tokenize(input: string, opts?: { keepStopwords?: boolean }): string[]
export const FIELD_WEIGHTS: Record<SearchField, number>
export const FIELD_IDS: Record<SearchField, number>
export const FIELD_BY_ID: readonly SearchField[]
