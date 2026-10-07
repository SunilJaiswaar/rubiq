/**
 * The shape of everything `scripts/build-content.mjs` emits.
 *
 * These types are the contract between the content pipeline and the app. If you change
 * the compiler's output, change it here too — `npm run typecheck` will then tell you
 * every call site that needs updating.
 */

export type Level = 'beginner' | 'basic' | 'intermediate' | 'advanced' | 'expert'
export type Status = 'draft' | 'review' | 'stable' | 'deprecated'

export type BlockName =
  | 'what' | 'why' | 'problem' | 'history' | 'analogy'
  | 'how' | 'internals'
  | 'example' | 'realworld' | 'production'
  | 'tradeoffs' | 'alternatives'
  | 'mistakes' | 'failure' | 'debugging'
  | 'security' | 'performance' | 'testing'
  | 'interview' | 'checkpoint' | 'practice' | 'build'
  | 'note' | 'warning' | 'jargon'

export type ModeName = 'full' | 'why' | 'internals' | 'realworld' | 'failure' | 'interview'

export interface BlockSpec {
  label: string
  icon: string
  tone: string
  summary: string
}

export interface ModeSpec {
  label: string
  blurb: string
  blocks: BlockName[] | null
}

export interface LessonStub {
  id: string
  track: string
  module: string
  slug: string
  title: string
  summary: string
  level: Level
  order: number
  minutes: number
  tags: string[]
  concepts: string[]
  prerequisites: string[]
  blocks: BlockName[]
  modes: ModeName[]
  hasQuiz: boolean
  hasExercise: boolean
  hasPlayground: boolean
  interviewCount: number
  /** Path under `content/`, e.g. `10-ruby/20-blocks/10-blocks-and-yield`. */
  sourcePath: string
  route: string
}

export interface Heading {
  depth: number
  text: string
}

export interface ChoiceOption {
  id: string
  text: string
  correct: boolean
  feedback: string
}

interface QuestionBase {
  id: string
  prompt: string
  explanation: string
  concept: string | null
}

export interface ChoiceQuestion extends QuestionBase {
  kind: 'choice' | 'multi'
  options: ChoiceOption[]
}

/** "Explain this in your own words." Self-assessed against key points — no fake grading. */
export interface RecallQuestion extends QuestionBase {
  kind: 'recall'
  keyPoints: string[]
  model: string
}

export interface OrderQuestion extends QuestionBase {
  kind: 'order'
  items: string[]
}

export type Question = ChoiceQuestion | RecallQuestion | OrderQuestion

export interface Quiz {
  questions: Question[]
  passScore: number
}

export interface ExerciseTest {
  id: string
  name: string
  call: string
  expect: unknown
  hidden: boolean
}

export interface SqlSeed {
  tables: Array<{
    name: string
    columns: Array<{ name: string; type: string }>
    rows: unknown[][]
  }>
}

export interface Exercise {
  id: string
  language: string
  title: string
  brief: string
  starter: string
  solution: string
  hints: string[]
  tests: ExerciseTest[]
  seed: SqlSeed | null
}

/** An in-lesson sandbox. For SQL, `seed` defines the tables the lesson's queries use. */
export interface Playground {
  language: string
  starter: string
  seed: SqlSeed | null
  indexes: Record<string, string[]>
  notes: string
}

export interface InterviewQuestion {
  question: string
  level?: Level | undefined
  hint?: string | undefined
  answer: string
  followUps?: string[] | undefined
  realWorld?: string | undefined
}

export interface Resource {
  title: string
  url: string
  kind?: string | undefined
}

export interface LessonLink {
  id: string
  title: string
  route: string
}

export interface Lesson extends LessonStub {
  html: string
  headings: Heading[]
  quiz: Quiz | null
  exercise: Exercise | null
  playground: Playground | null
  interview: InterviewQuestion[]
  resources: Resource[]
  version: string | null
  lastReviewed: string | null
  status: Status
  next: LessonLink | null
  previous: LessonLink | null
}

export interface Module {
  slug: string
  title: string
  summary: string
  level: Level
  order: number
  lessons: LessonStub[]
}

export interface Track {
  slug: string
  title: string
  tagline: string
  description: string
  category: string
  icon: string
  accent: string
  difficulty: Level
  prerequisites: string[]
  outcomes: string[]
  order: number
  lessonCount: number
  minutes: number
  modules: Module[]
}

export interface Catalog {
  generatedAt: string
  blocks: Record<BlockName, BlockSpec>
  modes: Record<ModeName, ModeSpec>
  tracks: Track[]
  totals: {
    tracks: number
    lessons: number
    minutes: number
    exercises: number
    quizzes: number
    interviewQuestions: number
  }
}

export interface RoadmapStage {
  title: string
  goal: string
  tracks: string[]
  skills?: string[]
  milestone?: string
}

export interface Roadmap {
  id: string
  title: string
  role: string
  summary: string
  experience: string
  stages: RoadmapStage[]
}

export interface RoadmapFile {
  roadmaps: Roadmap[]
}

export interface GraphNode {
  id: string
  label: string
  kind: 'track' | 'concept' | 'lesson'
  track: string | null
  lessons: LessonLink[]
  prerequisites: string[]
  next: string[]
}

export interface Graph {
  nodes: GraphNode[]
}
