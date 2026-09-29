import { FileText, Plane } from 'lucide-react'
import { lazy, Suspense } from 'react'
import { Route, Routes } from 'react-router'

import { PAGES } from '@/app/routes'
import { Shell } from '@/app/Shell'
import { NotFound } from '@/pages/NotFound'
import { Placeholder } from '@/pages/Placeholder'
import { StandalonePlaceholder } from '@/pages/StandalonePlaceholder'
import { Skeleton } from '@/components/ui/skeleton'

// Pages load on demand so the first screen opens fast.
const Styleguide = lazy(() => import('@/pages/Styleguide').then((m) => ({ default: m.Styleguide })))
const Console = lazy(() => import('@/pages/Console').then((m) => ({ default: m.Console })))
const Dashboard = lazy(() => import('@/pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const KnowledgeBase = lazy(() => import('@/pages/KnowledgeBase').then((m) => ({ default: m.KnowledgeBase })))
const ManualAudit = lazy(() => import('@/pages/ManualAudit').then((m) => ({ default: m.ManualAudit })))

const loading = <Skeleton className="h-96 w-full bg-surface" />

/** Pages that exist already; everything else in PAGES shows its placeholder until its phase. */
const BUILT: Record<string, React.ReactNode> = {
  '/': <Suspense fallback={loading}><Console /></Suspense>,
  '/dashboard': <Suspense fallback={loading}><Dashboard /></Suspense>,
  '/knowledge': <Suspense fallback={loading}><KnowledgeBase /></Suspense>,
  '/audit': <Suspense fallback={loading}><ManualAudit /></Suspense>,
  '/styleguide': <Suspense fallback={loading}><Styleguide /></Suspense>,
}

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        {PAGES.map((p) => (
          <Route key={p.path} path={p.path} element={BUILT[p.path] ?? <Placeholder page={p} />} />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
      {/* Outside the ops shell */}
      <Route
        path="/site"
        element={
          <StandalonePlaceholder
            icon={Plane}
            title="The Charminar Airways customer site"
            description="A landing page with a floating chat widget that uses the same guardrail. Built in Phase 9."
          />
        }
      />
      <Route
        path="/interactions/:id/report"
        element={
          <StandalonePlaceholder
            icon={FileText}
            title="Printable audit report"
            description="Question, drafts, claims, evidence, decision and timings for one conversation. Built in Phase 9."
          />
        }
      />
    </Routes>
  )
}
