/**
 * The single ProgressEngine/SrsEngine instance, shared through context.
 *
 * Engines are async to create (IndexedDB must open), so this provider renders children
 * immediately and exposes `ready`. Lessons must be readable before storage is available —
 * a learner on a browser with blocked storage should see content, not a spinner.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react'
import { ProgressEngine, type LessonProgress } from '@/engines/progress'
import { SrsEngine } from '@/engines/srs'

interface ProgressContextValue {
  progress: ProgressEngine | null
  srs: SrsEngine | null
  ready: boolean
  durable: boolean
  /** Bumped after any write, so dependent views re-read. */
  revision: number
  invalidate: () => void
}

const ProgressContext = createContext<ProgressContextValue>({
  progress: null, srs: null, ready: false, durable: true, revision: 0, invalidate: () => {},
})

export function ProgressProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ progress: ProgressEngine; srs: SrsEngine } | null>(null)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const [progress, srs] = await Promise.all([ProgressEngine.create(), SrsEngine.create()])
      if (!cancelled) setState({ progress, srs })
    })()
    return () => { cancelled = true }
  }, [])

  const invalidate = useCallback(() => setRevision((r) => r + 1), [])

  const value = useMemo<ProgressContextValue>(() => ({
    progress: state?.progress ?? null,
    srs: state?.srs ?? null,
    ready: state !== null,
    durable: state?.progress.durable ?? true,
    revision,
    invalidate,
  }), [state, revision, invalidate])

  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>
}

export const useProgressContext = () => useContext(ProgressContext)

/** Read a single lesson's progress, re-reading whenever anything is written. */
export function useLessonProgress(lessonId: string | null): LessonProgress | null {
  const { progress, revision } = useProgressContext()
  const [value, setValue] = useState<LessonProgress | null>(null)

  useEffect(() => {
    if (!progress || !lessonId) return
    let cancelled = false
    void progress.lesson(lessonId).then((p) => { if (!cancelled) setValue(p) })
    return () => { cancelled = true }
  }, [progress, lessonId, revision])

  return value
}

/** Every lesson's progress as a map. Used by catalog and progress views. */
export function useAllProgress(): Map<string, LessonProgress> {
  const { progress, revision } = useProgressContext()
  const [map, setMap] = useState<Map<string, LessonProgress>>(new Map())

  useEffect(() => {
    if (!progress) return
    let cancelled = false
    void progress.allLessonProgress().then((m) => { if (!cancelled) setMap(m) })
    return () => { cancelled = true }
  }, [progress, revision])

  return map
}

/**
 * Accumulate focused time on a lesson, in 15-second ticks, only while the tab is
 * visible. Pausing on hidden tabs is the difference between measuring study time and
 * measuring how long a tab was left open.
 */
export function useTimeOnLesson(lessonId: string | null): void {
  const { progress } = useProgressContext()
  const pending = useRef(0)

  useEffect(() => {
    if (!progress || !lessonId) return

    const TICK = 15
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') pending.current += TICK
    }, TICK * 1000)

    const flush = () => {
      const seconds = pending.current
      pending.current = 0
      if (seconds > 0) void progress.addTime(lessonId, seconds)
    }

    // Flush on hide as well as unmount: a closed tab never unmounts.
    document.addEventListener('visibilitychange', flush)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', flush)
      flush()
    }
  }, [progress, lessonId])
}
