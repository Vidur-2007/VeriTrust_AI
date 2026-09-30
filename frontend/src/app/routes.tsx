import {
  BookCheck,
  Crosshair,
  FileSearch,
  FlaskConical,
  Gauge,
  Inbox,
  Palette,
  Radar,
  SlidersHorizontal,
  type LucideIcon,
} from 'lucide-react'
import { matchPath } from 'react-router'

/** One table drives the rail, the command palette, the page titles and the route list. */
export interface PageDef {
  path: string
  title: string
  icon: LucideIcon
  /** Rail group; groups are separated by a rule, not labelled. */
  group: 'operate' | 'knowledge' | 'test' | 'configure'
  /** What the page is for, shown on its placeholder until it's built. */
  purpose: string
  /** Build phase from BUILD_PROMPTS.md, while the page is still a placeholder. */
  phase?: string
  keywords?: string
}

export const PAGES: PageDef[] = [
  {
    path: '/', title: 'Live console', icon: Radar, group: 'operate',
    purpose: 'Ask a customer question and watch the Maker, Judge and rules verify the answer live.',
    keywords: 'chat trace verify inject',
  },
  {
    path: '/dashboard', title: 'Dashboard', icon: Gauge, group: 'operate',
    purpose: 'Approval, correction and escalation rates, latency, and the recent interactions.',
    keywords: 'metrics kpi charts',
  },
  {
    path: '/review', title: 'Review queue', icon: Inbox, group: 'operate',
    purpose: 'Escalated conversations waiting for a person to approve or correct the reply.',
    keywords: 'escalations human',
  },
  {
    path: '/knowledge', title: 'Knowledge base', icon: BookCheck, group: 'knowledge',
    purpose: 'The verified facts the Judge checks against, with the drift timeline of every change.',
    keywords: 'facts drift edit',
  },
  {
    path: '/audit', title: 'Manual audit', icon: FileSearch, group: 'knowledge',
    purpose: 'Scan the support manuals against the verified facts and list the stale sections.',
    keywords: 'scan manuals stale',
  },
  {
    path: '/redteam', title: 'Red Team Lab', icon: Crosshair, group: 'test',
    purpose: 'Run attacks (fake fees, prompt injection, pressure) and watch the live scoreboard.',
    keywords: 'attacks run scoreboard',
  },
  {
    path: '/eval', title: 'Evaluation', icon: FlaskConical, group: 'test',
    purpose: 'Hallucination rate with and without the guardrail, catch rate and latency cost.',
    keywords: 'benchmark baseline guarded',
  },
  {
    path: '/settings', title: 'Settings', icon: SlidersHorizontal, group: 'configure',
    purpose: 'Strictness, retry limit, high-risk categories and the alert threshold.',
    keywords: 'strictness retries alerts',
  },
  {
    path: '/styleguide', title: 'Styleguide', icon: Palette, group: 'configure',
    purpose: 'Every design token and component.',
    keywords: 'tokens components design',
  },
]

export const GROUP_ORDER: PageDef['group'][] = ['operate', 'knowledge', 'test', 'configure']

export function pageFor(pathname: string): PageDef | undefined {
  return PAGES.find((p) => matchPath({ path: p.path, end: true }, pathname))
}
