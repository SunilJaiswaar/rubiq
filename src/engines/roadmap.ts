/**
 * Personalised roadmaps (brief §39).
 *
 * The honest version of "personalisation": we do not pretend to model a learner from a
 * three-question form. We do two things that are actually defensible —
 *
 *   1. **Gap analysis from evidence.** A skill bar reflects measured quiz accuracy and
 *      completed lessons, not what the learner said about themselves. A self-report only
 *      sets the *starting assumption* and is visibly labelled as such until real data
 *      replaces it.
 *   2. **Ordering by prerequisite, then by gap.** The next thing to learn is the highest-
 *      impact track whose prerequisites the learner has already met. Never a track whose
 *      foundations are missing, however big the gap looks.
 */
import type { LessonProgress } from './progress'
import type { ConceptStat } from './progress'
import type { Roadmap, Track } from '@/content/types'

export type Experience = 'none' | 'student' | 'junior' | 'mid' | 'senior'

export interface Profile {
  experience: Experience
  currentRole: string
  targetRole: string
  /** Roadmap id chosen from content/_roadmaps.yml. */
  roadmapId: string | null
  primaryLanguage: string
  minutesPerDay: number
  /** Self-reported familiarity per track slug, 0..1. Superseded by evidence. */
  selfReport: Record<string, number>
  createdAt: string
}

export interface SkillGap {
  track: string
  title: string
  /** 0..1 — how much of this track the learner has actually demonstrated. */
  mastery: number
  /** True when `mastery` comes from self-report, not from completed work. */
  estimated: boolean
  lessonsCompleted: number
  lessonsTotal: number
  /** Measured accuracy across this track's concepts, or null if never quizzed. */
  accuracy: number | null
  prerequisitesMet: boolean
  missingPrerequisites: string[]
}

export const emptyProfile = (): Profile => ({
  experience: 'none',
  currentRole: '',
  targetRole: '',
  roadmapId: null,
  primaryLanguage: 'ruby',
  minutesPerDay: 30,
  selfReport: {},
  createdAt: new Date().toISOString(),
})

/**
 * Mastery of a track, from evidence where we have it.
 *
 * Weighting: completion carries 60%, quiz accuracy 40%. Completion alone would reward
 * clicking through; accuracy alone would ignore breadth.
 */
export function computeGaps(
  tracks: Track[],
  progress: Map<string, LessonProgress>,
  conceptStats: ConceptStat[],
  profile: Profile | null,
): SkillGap[] {
  const statByConcept = new Map(conceptStats.map((s) => [s.concept, s]))
  const completedTracks = new Set<string>()

  // First pass: completion ratios, so prerequisite checks can use them.
  const completion = new Map<string, { done: number; total: number }>()
  for (const track of tracks) {
    const lessons = track.modules.flatMap((m) => m.lessons)
    const done = lessons.filter((l) => progress.get(l.id)?.completed).length
    completion.set(track.slug, { done, total: lessons.length })
    if (lessons.length > 0 && done / lessons.length >= 0.8) completedTracks.add(track.slug)
  }

  return tracks.map((track) => {
    const lessons = track.modules.flatMap((m) => m.lessons)
    const counts = completion.get(track.slug) ?? { done: 0, total: 0 }

    const concepts = [...new Set(lessons.flatMap((l) => l.concepts))]
    const seen = concepts.map((c) => statByConcept.get(c)).filter((s): s is ConceptStat => !!s)
    const totalAnswers = seen.reduce((n, s) => n + s.total, 0)
    const accuracy =
      totalAnswers === 0 ? null : seen.reduce((n, s) => n + s.correct, 0) / totalAnswers

    const completionRatio = counts.total === 0 ? 0 : counts.done / counts.total
    const hasEvidence = counts.done > 0 || totalAnswers > 0

    const mastery = hasEvidence
      ? 0.6 * completionRatio + 0.4 * (accuracy ?? completionRatio)
      : (profile?.selfReport[track.slug] ?? 0)

    const missing = track.prerequisites.filter((p) => !completedTracks.has(p))

    return {
      track: track.slug,
      title: track.title,
      mastery: Math.min(1, Math.max(0, mastery)),
      estimated: !hasEvidence,
      lessonsCompleted: counts.done,
      lessonsTotal: counts.total,
      accuracy,
      prerequisitesMet: missing.length === 0,
      missingPrerequisites: missing,
    }
  })
}

export interface Recommendation {
  track: string
  title: string
  reason: string
  /** Higher is more urgent. */
  priority: number
  blocked: boolean
}

/**
 * What to learn next. Tracks the chosen roadmap puts early rank highest; a track whose
 * prerequisites are unmet is surfaced but marked blocked, with the prerequisite named —
 * so the learner is never told to go learn something they cannot start.
 */
export function recommend(
  gaps: SkillGap[],
  tracks: Track[],
  roadmap: Roadmap | null,
  limit = 5,
): Recommendation[] {
  const titleOf = new Map(tracks.map((t) => [t.slug, t.title]))

  // Earlier stages of the chosen roadmap matter more.
  const stageIndex = new Map<string, number>()
  roadmap?.stages.forEach((stage, i) => {
    for (const slug of stage.tracks) if (!stageIndex.has(slug)) stageIndex.set(slug, i)
  })

  const scored = gaps.map((gap) => {
    const stage = stageIndex.get(gap.track)
    const onPath = stage !== undefined
    const gapSize = 1 - gap.mastery

    // In-progress work outranks a fresh start: finishing beats collecting.
    const inProgress = gap.lessonsCompleted > 0 && gap.mastery < 0.8

    // Weights are tuned so that *finishing* beats *starting*. An untouched track
    // always has the bigger gap, so if gap size dominated, the learner would be
    // pushed to open a new track every time — the exact collecting-not-learning
    // behaviour this platform is supposed to avoid. Hence gap is worth less per
    // point than momentum is.
    let priority = gapSize * 60
    if (stage !== undefined) priority += 60 - stage * 10
    if (inProgress) priority += 45
    if (!gap.prerequisitesMet) priority -= 70
    if (gap.mastery >= 0.8) priority -= 200 // essentially done

    let reason: string
    if (!gap.prerequisitesMet) {
      const names = gap.missingPrerequisites.map((slug) => titleOf.get(slug) ?? slug).join(', ')
      reason = `Start ${names} first — this track builds on it`
    } else if (inProgress) {
      reason = `You are ${Math.round((gap.lessonsCompleted / Math.max(1, gap.lessonsTotal)) * 100)}% through this — finish it`
    } else if (gap.accuracy !== null && gap.accuracy < 0.7) {
      reason = `Your quiz accuracy here is ${Math.round(gap.accuracy * 100)}% — worth another pass`
    } else if (onPath) {
      reason = `Stage ${stage + 1} of your roadmap`
    } else {
      reason = 'Not started'
    }

    return {
      track: gap.track,
      title: gap.title,
      reason,
      priority,
      blocked: !gap.prerequisitesMet,
    }
  })

  return scored
    .filter((r) => r.priority > -100)
    .sort((a, b) => b.priority - a.priority)
    .slice(0, limit)
}

/**
 * Turn available minutes into a weekly plan of specific lessons.
 * Pads by 20% because learners consistently underestimate — and a plan you beat is
 * motivating in a way that a plan you miss is not.
 */
export function weeklyPlan(
  tracks: Track[],
  recommendations: Recommendation[],
  progress: Map<string, LessonProgress>,
  minutesPerDay: number,
): Array<{ lessonId: string; title: string; route: string; minutes: number; track: string }> {
  const budget = minutesPerDay * 7 * 0.8
  const byTrack = new Map(tracks.map((t) => [t.slug, t]))
  const plan: Array<{ lessonId: string; title: string; route: string; minutes: number; track: string }> = []
  let used = 0

  for (const rec of recommendations) {
    if (rec.blocked) continue
    const track = byTrack.get(rec.track)
    if (!track) continue
    for (const lesson of track.modules.flatMap((m) => m.lessons)) {
      if (progress.get(lesson.id)?.completed) continue
      if (used + lesson.minutes > budget) break
      plan.push({
        lessonId: lesson.id,
        title: lesson.title,
        route: lesson.route,
        minutes: lesson.minutes,
        track: track.title,
      })
      used += lesson.minutes
    }
    if (used >= budget) break
  }

  return plan
}
