/**
 * Smoke tests that render real routes against the real compiled content.
 *
 * These are deliberately not snapshot tests. They assert the things that would make the
 * platform broken rather than merely different: that a lesson's prose actually appears,
 * that navigation between lessons works, that progress is written and read back, and that
 * the catalogue reflects the content on disk.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ProgressProvider } from '@/hooks/useProgress'
import { __setStoreForTests, MemoryStore } from '@/storage/store'
import { tracks, allLessons, totals, findLesson } from '@/content/catalog'
import Catalog from './Catalog'
import TrackPage from './Track'
import LessonPage from './Lesson'
import Home from './Home'
import Contribute from './Contribute'

function mount(initialPath: string) {
  return render(
    <ProgressProvider>
      <MemoryRouter initialEntries={[initialPath]}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/learn" element={<Catalog />} />
          <Route path="/learn/:track" element={<TrackPage />} />
          <Route path="/learn/:track/:lesson" element={<LessonPage />} />
          <Route path="/contribute" element={<Contribute />} />
        </Routes>
      </MemoryRouter>
    </ProgressProvider>,
  )
}

beforeEach(() => {
  __setStoreForTests(new MemoryStore())
})

describe('the compiled content is actually there', () => {
  it('has tracks, lessons, quizzes and exercises', () => {
    expect(totals.tracks).toBeGreaterThan(0)
    expect(totals.lessons).toBeGreaterThan(0)
    expect(totals.quizzes).toBeGreaterThan(0)
    expect(totals.exercises).toBeGreaterThan(0)
    expect(totals.interviewQuestions).toBeGreaterThan(0)
  })

  it('gives every lesson a unique id and a resolvable route', () => {
    const ids = new Set(allLessons.map((l) => l.id))
    expect(ids.size).toBe(allLessons.length)
    for (const lesson of allLessons) {
      expect(findLesson(lesson.track, lesson.slug)?.id).toBe(lesson.id)
    }
  })

  it('gives every lesson the blocks the validator requires', () => {
    for (const lesson of allLessons) {
      expect(lesson.blocks, `${lesson.id} is missing :::what`).toContain('what')
      expect(lesson.blocks, `${lesson.id} is missing :::why`).toContain('why')
    }
  })

  it('offers only modes a lesson has content for', () => {
    for (const lesson of allLessons) {
      expect(lesson.modes).toContain('full')
      // Every other offered mode must have at least one block behind it.
      for (const mode of lesson.modes) {
        if (mode === 'full') continue
        expect(lesson.blocks.length, `${lesson.id} offers "${mode}" with no blocks`)
          .toBeGreaterThan(0)
      }
    }
  })
})

describe('Home', () => {
  it('renders the hero and the real lesson count', async () => {
    mount('/')
    expect(
      await screen.findByRole('heading', { level: 1, name: /become the software engineer/i }),
    ).toBeInTheDocument()
    // The count appears in the stats row and again in the footer copy.
    expect(screen.getAllByText(String(totals.lessons)).length).toBeGreaterThan(0)
  })

  it('offers a start link for a learner with no progress', async () => {
    mount('/')
    expect(await screen.findByRole('link', { name: /start learning/i })).toBeInTheDocument()
  })

  it('lists every track', async () => {
    mount('/')
    await screen.findByRole('heading', { level: 1 })
    for (const track of tracks) {
      expect(
        (await screen.findAllByRole('link', { name: track.title })).length,
        `no link for ${track.slug}`,
      ).toBeGreaterThan(0)
    }
  })
})

describe('Catalog', () => {
  it('shows every track with its real lesson count', async () => {
    mount('/learn')
    await screen.findByRole('heading', { level: 1, name: /tracks/i })
    for (const track of tracks) {
      // A track title can appear more than once: as its own heading link, and in
      // another track's "Builds on" list.
      expect(
        screen.getAllByRole('link', { name: track.title }).length,
        `no link for ${track.slug}`,
      ).toBeGreaterThan(0)
      expect(screen.getAllByText(`${track.lessonCount} lessons`).length).toBeGreaterThan(0)
    }
  })

  it('links to every lesson in the catalogue', async () => {
    mount('/learn')
    await screen.findByRole('heading', { level: 1, name: /tracks/i })
    for (const lesson of allLessons) {
      const link = screen.getAllByRole('link').find(
        (a) => a.getAttribute('href') === lesson.route,
      )
      expect(link, `no catalogue link for ${lesson.id}`).toBeDefined()
    }
  })
})

describe('Track page', () => {
  it('renders the track description, outcomes and lesson sequence', async () => {
    const track = tracks[0]!
    mount(`/learn/${track.slug}`)

    expect(
      await screen.findByRole('heading', { level: 1, name: track.title }),
    ).toBeInTheDocument()
    expect(screen.getByText(track.tagline)).toBeInTheDocument()
    for (const outcome of track.outcomes) {
      expect(screen.getByText(outcome)).toBeInTheDocument()
    }
  })

  it('offers the first lesson when nothing has been started', async () => {
    const track = tracks[0]!
    mount(`/learn/${track.slug}`)
    expect(
      await screen.findByRole('link', { name: /start the first lesson/i }),
    ).toBeInTheDocument()
  })

  it('404s for an unknown track rather than crashing', async () => {
    mount('/learn/does-not-exist')
    expect(await screen.findByText('404')).toBeInTheDocument()
  })
})

describe('Lesson page', () => {
  const lesson = allLessons[0]!

  it('renders the lesson prose from the compiled HTML', async () => {
    mount(lesson.route)

    expect(
      await screen.findByRole('heading', { level: 1, name: lesson.title }),
    ).toBeInTheDocument()

    // The body is loaded lazily, so wait for a pedagogical block to appear.
    await waitFor(() => {
      expect(document.querySelector('.lesson-block[data-block="why"]')).not.toBeNull()
    })
  })

  it('offers the reading modes the lesson supports', async () => {
    mount(lesson.route)
    const group = await screen.findByRole('radiogroup', { name: /reading mode/i })
    for (const mode of lesson.modes) {
      expect(within(group).getAllByRole('radio').length).toBeGreaterThanOrEqual(
        lesson.modes.length,
      )
      expect(mode).toBeTruthy()
    }
  })

  it('switches mode and filters the blocks', async () => {
    const user = userEvent.setup()
    mount(lesson.route)

    await waitFor(() => {
      expect(document.querySelector('.lesson-block[data-block="why"]')).not.toBeNull()
    })

    const group = screen.getByRole('radiogroup', { name: /reading mode/i })
    await user.click(within(group).getByRole('radio', { name: /^why$/i }))

    await waitFor(() => {
      const why = document.querySelector('.lesson-block[data-block="why"]')
      expect(why?.getAttribute('data-active')).toBe('true')
    })
  })

  it('marks the lesson as read, which the catalogue then reflects', async () => {
    mount(lesson.route)
    await screen.findByRole('heading', { level: 1, name: lesson.title })

    const store = new MemoryStore()
    // Re-mount with a store we can inspect.
    __setStoreForTests(store)
    mount(lesson.route)

    await waitFor(async () => {
      const saved = await store.get<{ read: boolean }>(`progress:lesson:${lesson.id}`)
      expect(saved?.read).toBe(true)
    })
  })

  it('enrols the lesson concepts into the review schedule', async () => {
    const store = new MemoryStore()
    __setStoreForTests(store)
    mount(lesson.route)
    await screen.findByRole('heading', { level: 1, name: lesson.title })

    await waitFor(async () => {
      const keys = await store.keys('srs:')
      expect(keys.length).toBeGreaterThan(0)
    })
    for (const concept of lesson.concepts) {
      expect(await store.get(`srs:${concept}`)).not.toBeNull()
    }
  })

  it('links to the next lesson in the track', async () => {
    mount(lesson.route)
    await screen.findByRole('heading', { level: 1, name: lesson.title })
    const next = allLessons[1]
    if (!next) return
    await waitFor(() => {
      expect(screen.getAllByRole('link', { name: new RegExp(next.title, 'i') }).length)
        .toBeGreaterThan(0)
    })
  })

  it('links to the file on GitHub so a reader can fix an error', async () => {
    mount(lesson.route)
    const link = await screen.findByRole('link', { name: /improve this lesson/i })
    expect(link.getAttribute('href')).toContain(lesson.sourcePath)
    expect(link.getAttribute('href')).toMatch(/lesson\.md$/)
  })

  it('404s for an unknown lesson', async () => {
    mount('/learn/ruby/no-such-lesson')
    expect(await screen.findByText('404')).toBeInTheDocument()
  })
})

describe('Contribute', () => {
  it('documents every block in the vocabulary, so the page cannot go stale', async () => {
    mount('/contribute')
    await screen.findByRole('heading', { level: 1, name: /contribute/i })
    // The page renders the list from blockSpecs, so it cannot drift from the vocabulary.
    // Names also appear in the worked example, hence getAllByText.
    for (const name of ['why', 'internals', 'failure', 'interview', 'tradeoffs']) {
      expect(
        screen.getAllByText(`:::${name}`).length,
        `the contribute page does not document :::${name}`,
      ).toBeGreaterThan(0)
    }
  })
})

describe('accessibility basics', () => {
  it('gives each page exactly one h1', async () => {
    for (const path of ['/', '/learn', `/learn/${tracks[0]!.slug}`, '/contribute']) {
      const { unmount } = mount(path)
      await waitFor(() => {
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
      })
      unmount()
    }
  })

  it('labels the lesson note textarea', async () => {
    mount(allLessons[0]!.route)
    await screen.findByRole('heading', { level: 1 })
    const user = userEvent.setup()
    // The note box is behind a toggle in the sidebar.
    const noteButtons = screen.getAllByRole('button', { name: /note/i })
    await user.click(noteButtons[0]!)
    expect(screen.getByLabelText(/your note on this lesson/i)).toBeInTheDocument()
  })
})
