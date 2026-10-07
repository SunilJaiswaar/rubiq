import { isRouteErrorResponse, useRouteError, Link } from 'react-router-dom'
import { Page, Card, ButtonLink } from '@/ui/primitives'

/**
 * The error boundary for every route.
 *
 * It states what failed and offers a way out. A learner who hits an error should not have
 * to guess whether the problem is their connection, their browser, or our bug.
 */
export function RouteError() {
  const error = useRouteError()

  const { title, detail } = describe(error)

  return (
    <Page width="narrow" className="py-20">
      <Card className="p-8">
        <h1 className="text-xl font-semibold text-ink">{title}</h1>
        <p className="mt-3 text-sm text-ink-muted leading-relaxed">{detail}</p>

        <div className="mt-6 flex flex-wrap gap-2">
          <ButtonLink to="/" variant="primary">Back to the home page</ButtonLink>
          <ButtonLink to="/learn">Browse tracks</ButtonLink>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-ink-muted hover:text-ink px-3 py-2"
          >
            Reload
          </button>
        </div>

        <p className="mt-8 pt-6 border-t border-border text-xs text-ink-faint">
          If this keeps happening it is a bug worth reporting —{' '}
          <a
            href="https://github.com/SunilJaiswaar/rubiq/issues/new"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-ink-muted"
          >
            open an issue
          </a>
          , and include what you were doing. Your progress is stored locally and is not
          affected by this error.
        </p>

        {import.meta.env.DEV && error instanceof Error && (
          <pre className="mt-4 p-3 text-[0.6875rem] bg-surface border border-border rounded-lg overflow-x-auto text-ink-muted">
            {error.stack}
          </pre>
        )}
      </Card>
    </Page>
  )
}

function describe(error: unknown): { title: string; detail: string } {
  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      return {
        title: 'That page does not exist',
        detail:
          'The link may be out of date, or a lesson may have been renamed. The catalogue below lists everything that is here now.',
      }
    }
    return {
      title: `Error ${error.status}`,
      detail: error.statusText || 'Something went wrong loading this page.',
    }
  }

  // A chunk that fails to load is usually a stale service worker after a deploy —
  // worth saying so, because reloading genuinely fixes it.
  if (error instanceof Error && /dynamically imported module|Failed to fetch/i.test(error.message)) {
    return {
      title: 'Part of the app could not load',
      detail:
        'This usually means a new version was deployed while your tab was open, so the file this page wanted no longer exists. Reloading should fix it.',
    }
  }

  return {
    title: 'Something broke',
    detail:
      'An unexpected error stopped this page from rendering. Your saved progress is untouched.',
  }
}

export function NotFoundBody() {
  return (
    <Page width="narrow" className="py-20 text-center">
      <p className="text-sm font-mono text-ink-faint">404</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink">
        There is no page here
      </h1>
      <p className="mt-3 text-sm text-ink-muted">
        Try the <Link to="/learn" className="text-accent underline">catalogue</Link>, or
        press <kbd className="font-mono text-xs border border-border rounded px-1">/</kbd>{' '}
        to search.
      </p>
    </Page>
  )
}
