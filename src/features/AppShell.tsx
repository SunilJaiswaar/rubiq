import { useCallback, useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '@/hooks/useTheme'
import { useProgressContext } from '@/hooks/useProgress'
import { useShortcut } from '@/hooks/useKeyboard'
import { Page, cx } from '@/ui/primitives'
import { CommandPalette } from './CommandPalette'
import { totals } from '@/content/catalog'

const NAV = [
  { to: '/learn', label: 'Learn' },
  { to: '/roadmaps', label: 'Roadmaps' },
  { to: '/practice', label: 'Practice' },
  { to: '/interview', label: 'Interview' },
  { to: '/review', label: 'Review' },
  { to: '/progress', label: 'Progress' },
] as const

const REPO = 'https://github.com/SunilJaiswaar/rubiq'

export function AppShell() {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { theme, cycle } = useTheme()
  const { durable, ready } = useProgressContext()
  const location = useLocation()
  const navigate = useNavigate()

  // Scroll to top on navigation, except when jumping to an anchor.
  useEffect(() => {
    if (location.hash) return
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [location.pathname, location.hash])

  const openPalette = useCallback((event: KeyboardEvent) => {
    event.preventDefault()
    setPaletteOpen(true)
  }, [])

  useShortcut('/', openPalette)
  useShortcut('k', openPalette) // also reachable as a letter, for keyboards where / is awkward

  useShortcut('Escape', useCallback(() => {
    setPaletteOpen(false)
    setMenuOpen(false)
  }, []), { allowInInput: true })

  return (
    <div className="min-h-dvh flex flex-col bg-canvas">
      <a href="#main" className="skip-link">Skip to content</a>

      <header className="sticky top-0 z-40 border-b border-border bg-canvas/85 backdrop-blur-md">
        <Page>
          <div className="h-14 flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-2 font-semibold tracking-tight shrink-0 text-ink"
            >
              <Logo />
              <span>Rubiq</span>
            </Link>

            <nav aria-label="Main" className="hidden md:flex items-center gap-0.5 ml-3">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cx(
                      'px-2.5 py-1.5 rounded-md text-sm transition-colors',
                      isActive
                        ? 'text-ink font-medium bg-surface'
                        : 'text-ink-muted hover:text-ink hover:bg-surface',
                    )
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="flex-1" />

            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className={cx(
                'flex items-center gap-2 text-sm text-ink-faint',
                'border border-border rounded-lg px-2.5 py-1.5 bg-surface',
                'hover:border-border-strong hover:text-ink-muted transition-colors',
              )}
              aria-label={`Search ${totals.lessons} lessons`}
            >
              <SearchIcon />
              <span className="hidden sm:inline">Search</span>
              <kbd
                className="hidden sm:inline font-mono text-[0.6875rem] px-1 py-px rounded border border-border bg-canvas"
                aria-hidden="true"
              >
                /
              </kbd>
            </button>

            <button
              type="button"
              onClick={cycle}
              className="p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors"
              aria-label={`Theme: ${theme}. Click to change.`}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon theme={theme} />
            </button>

            <a
              href={REPO}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:block p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface transition-colors"
              aria-label="Source on GitHub (opens in a new tab)"
            >
              <GithubIcon />
            </a>

            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden p-2 rounded-lg text-ink-muted hover:text-ink hover:bg-surface"
              aria-expanded={menuOpen}
              aria-controls="mobile-nav"
              aria-label="Menu"
            >
              <MenuIcon open={menuOpen} />
            </button>
          </div>
        </Page>

        {menuOpen && (
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="md:hidden border-t border-border bg-canvas"
          >
            <Page>
              <div className="py-2 grid grid-cols-2 gap-1">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    // Closed here rather than in an effect on the route change: the
                    // click is the thing that dismisses the menu, so that is where
                    // it belongs — and it avoids a second render.
                    onClick={() => setMenuOpen(false)}
                    className={({ isActive }) =>
                      cx(
                        'px-3 py-2.5 rounded-md text-sm',
                        isActive ? 'text-ink font-medium bg-surface' : 'text-ink-muted',
                      )
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
                <a
                  href={REPO}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setMenuOpen(false)}
                  className="px-3 py-2.5 rounded-md text-sm text-ink-muted"
                >
                  GitHub ↗
                </a>
              </div>
            </Page>
          </nav>
        )}
      </header>

      {/* Tell the learner when progress will not survive a reload, rather than losing
          their work silently. */}
      {ready && !durable && (
        <div
          role="status"
          className="bg-caution-soft border-b border-caution/30 text-caution text-xs"
        >
          <Page>
            <p className="py-2">
              Your browser is blocking local storage, so progress will not be saved after
              you close this tab. Lessons, exercises and quizzes all still work.
            </p>
          </Page>
        </div>
      )}

      <main id="main" className="flex-1">
        <Outlet />
      </main>

      <footer className="border-t border-border mt-20 py-10 text-sm text-ink-muted">
        <Page>
          <div className="flex flex-col sm:flex-row gap-6 sm:gap-10 justify-between">
            <div className="max-w-sm">
              <div className="flex items-center gap-2 font-semibold text-ink mb-2">
                <Logo /> Rubiq
              </div>
              <p className="leading-relaxed">
                Free and open source. {totals.lessons} lessons across {totals.tracks}{' '}
                tracks, every one of them a Markdown file you can improve.
              </p>
            </div>
            <div className="flex gap-10">
              <div>
                <h3 className="font-medium text-ink mb-2 text-xs uppercase tracking-wide">Learn</h3>
                <ul className="space-y-1.5">
                  <li><Link to="/learn" className="hover:text-ink">All tracks</Link></li>
                  <li><Link to="/roadmaps" className="hover:text-ink">Roadmaps</Link></li>
                  <li><Link to="/graph" className="hover:text-ink">Concept map</Link></li>
                  <li><Link to="/playground" className="hover:text-ink">Playground</Link></li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-ink mb-2 text-xs uppercase tracking-wide">Project</h3>
                <ul className="space-y-1.5">
                  <li><Link to="/contribute" className="hover:text-ink">Contribute</Link></li>
                  <li>
                    <a href={REPO} target="_blank" rel="noopener noreferrer" className="hover:text-ink">
                      Source ↗
                    </a>
                  </li>
                  <li>
                    <a
                      href={`${REPO}/issues/new?labels=content`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-ink"
                    >
                      Report an error ↗
                    </a>
                  </li>
                  <li><Link to="/progress" className="hover:text-ink">Export your data</Link></li>
                </ul>
              </div>
            </div>
          </div>
        </Page>
      </footer>

      {/* Mounted only while open, so it starts from clean state every time
          instead of resetting itself in effects. */}
      {paletteOpen && (
        <CommandPalette
          onClose={() => setPaletteOpen(false)}
          onNavigate={(to) => { setPaletteOpen(false); void navigate(to) }}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------- icons */
/* Inline SVG rather than an icon package: a dozen glyphs is not worth a dependency,
   and these inherit currentColor so they theme for free. */

function Logo() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" className="text-accent">
      <path
        d="M4 15.5 10 3l6 12.5H12.2L10 10.8l-2.2 4.7H4Z"
        fill="currentColor"
      />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function ThemeIcon({ theme }: { theme: string }) {
  if (theme === 'dark') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    )
  }
  if (theme === 'light') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path
          d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.3 3.3l1 1M11.7 11.7l1 1M12.7 3.3l-1 1M4.3 11.7l-1 1"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    )
  }
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.5" y="3" width="13" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.5 14h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-2.65-.89-2.65-2.37 0-.72.26-1.31.68-1.77-.07-.2-.3-.86.07-1.78 0 0 .55-.17 1.81.68a6.1 6.1 0 0 1 3.3 0c1.26-.86 1.81-.68 1.81-.68.37.93.14 1.59.07 1.78.42.46.68 1.05.68 1.77 0 1.49-.88 2.17-2.66 2.37.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A7.99 7.99 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
      {open ? (
        <path d="M4 4l10 10M14 4 4 14" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      ) : (
        <path d="M2.5 5h13M2.5 9h13M2.5 13h13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
      )}
    </svg>
  )
}
