import { createBrowserRouter, type RouteObject } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { AppShell } from './features/AppShell'
import { RouteError } from './features/RouteError'
import { Spinner, Page } from './ui/primitives'

/**
 * Every route is a separate chunk. Home is the only one most visitors load, and the
 * playground (which pulls in Monaco) must never be in the initial bundle.
 */
const Home = lazy(() => import('./routes/Home'))
const Catalog = lazy(() => import('./routes/Catalog'))
const Track = lazy(() => import('./routes/Track'))
const Lesson = lazy(() => import('./routes/Lesson'))
const Search = lazy(() => import('./routes/Search'))
const Roadmaps = lazy(() => import('./routes/Roadmaps'))
const Practice = lazy(() => import('./routes/Practice'))
const Playground = lazy(() => import('./routes/Playground'))
const Interview = lazy(() => import('./routes/Interview'))
const Review = lazy(() => import('./routes/Review'))
const ProgressPage = lazy(() => import('./routes/Progress'))
const Graph = lazy(() => import('./routes/Graph'))
const Contribute = lazy(() => import('./routes/Contribute'))
const NotFound = lazy(() => import('./routes/NotFound'))

function Loading() {
  return (
    <Page className="py-24">
      <div className="flex justify-center">
        <Spinner label="Loading" />
      </div>
    </Page>
  )
}

const page = (element: React.ReactNode) => <Suspense fallback={<Loading />}>{element}</Suspense>

const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: page(<Home />) },
      { path: 'learn', element: page(<Catalog />) },
      { path: 'learn/:track', element: page(<Track />) },
      { path: 'learn/:track/:lesson', element: page(<Lesson />) },
      { path: 'search', element: page(<Search />) },
      { path: 'roadmaps', element: page(<Roadmaps />) },
      { path: 'roadmaps/:id', element: page(<Roadmaps />) },
      { path: 'practice', element: page(<Practice />) },
      { path: 'playground', element: page(<Playground />) },
      { path: 'interview', element: page(<Interview />) },
      { path: 'review', element: page(<Review />) },
      { path: 'progress', element: page(<ProgressPage />) },
      { path: 'graph', element: page(<Graph />) },
      { path: 'contribute', element: page(<Contribute />) },
      { path: '*', element: page(<NotFound />) },
    ],
  },
]

export const router = createBrowserRouter(routes, {
  basename: import.meta.env.BASE_URL.replace(/\/$/, '') || '/',
})
