/**
 * Runner registry.
 *
 * Ruby, JavaScript, TypeScript and SQL all run locally, in the browser. Ruby is real
 * CRuby compiled to WebAssembly; nothing executes on a server, because there is no server.
 *
 * Everything else gets an honest `unavailable` runner that explains itself, rather than a
 * button that does nothing (brief §63). When a sandbox service exists, swap
 * `UnavailableRunner` for a `RemoteRunner` here — no component changes.
 */
import type { CodeRunner, Language, RunResult } from './types'
import { JsRunner } from './js-runner'
import { SqlRunner } from './sql-runner'
import { RubyRunner } from './ruby-runner'

class UnavailableRunner implements CodeRunner {
  readonly availability = 'unavailable' as const
  constructor(
    readonly language: Language,
    readonly label: string,
    readonly unavailableReason: string,
  ) {}

  async run(): Promise<RunResult> {
    return {
      ok: false,
      console: [],
      error: { message: `${this.label} cannot run in the browser yet.`, hint: this.unavailableReason },
      durationMs: 0,
      timedOut: false,
    }
  }
}

const NOT_YET =
  'Running this language needs a sandboxed server, which this deployment does not have. ' +
  'The code, tests and reference solution are all here to read and reason about — and the ' +
  'runner interface is already in place, so execution lights up the day a sandbox is added.'

const registry = new Map<Language, () => CodeRunner>([
  ['javascript', () => new JsRunner('javascript')],
  ['typescript', () => new JsRunner('typescript')],
  ['sql', () => new SqlRunner()],
  ['ruby', () => new RubyRunner()],
  ['python', () => new UnavailableRunner('python', 'Python', NOT_YET)],
  ['go', () => new UnavailableRunner('go', 'Go', NOT_YET)],
  ['java', () => new UnavailableRunner('java', 'Java', NOT_YET)],
  ['cpp', () => new UnavailableRunner('cpp', 'C++', NOT_YET)],
  ['c', () => new UnavailableRunner('c', 'C', NOT_YET)],
  ['csharp', () => new UnavailableRunner('csharp', 'C#', NOT_YET)],
  ['php', () => new UnavailableRunner('php', 'PHP', NOT_YET)],
  ['rust', () => new UnavailableRunner('rust', 'Rust', NOT_YET)],
])

const instances = new Map<Language, CodeRunner>()

export function getRunner(language: string): CodeRunner {
  const key = normaliseLanguage(language)
  const cached = instances.get(key)
  if (cached) return cached
  const factory = registry.get(key)
  const runner = factory
    ? factory()
    : new UnavailableRunner(key, language, 'This language has no runner registered.')
  instances.set(key, runner)
  return runner
}

export function normaliseLanguage(language: string): Language {
  const alias: Record<string, Language> = {
    js: 'javascript', node: 'javascript', ts: 'typescript', rb: 'ruby', py: 'python',
    'c++': 'cpp', cs: 'csharp', 'c#': 'csharp', postgres: 'sql', postgresql: 'sql', mysql: 'sql',
  }
  const lower = language.toLowerCase().trim()
  return alias[lower] ?? (lower as Language)
}

/** Declared rather than derived, so importing this module constructs nothing. */
export const RUNNABLE_LANGUAGES: Language[] = ['ruby', 'javascript', 'typescript', 'sql']

export { JsRunner, SqlRunner, RubyRunner }
export type { CodeRunner, RunResult, Language } from './types'
