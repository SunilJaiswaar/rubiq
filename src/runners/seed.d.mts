import type { SqlSeed } from '@/content/types'

export interface GeneratorColumn {
  kind: string
  [key: string]: unknown
}
export interface GenerateSpec {
  count: number
  columns: GeneratorColumn[]
}
export function generateRows(spec: GenerateSpec, columnCount: number): unknown[][]
export function expandSeed(seed: SqlSeed | null, where?: string): SqlSeed | null
export const GENERATOR_KINDS: string[]
