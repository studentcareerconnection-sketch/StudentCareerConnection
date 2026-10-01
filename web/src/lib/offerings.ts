// Offering history from WebSoc: which quarters a course usually runs in, used to warn
// about unusual placements and to prefer regularly offered electives.
import type { Offerings, Quarter } from '../types'

// WebSoc term suffix -> quarter. Summer sessions (SS1, 10-week, SS2) all count as Summer;
// Law / medical-school terms are ignored.
const SUFFIX: Record<string, Quarter> = { '92': 'Fall', '03': 'Winter', '14': 'Spring', '25': 'Summer', '39': 'Summer', '76': 'Summer' }

/** Academic year a term belongs to: Fall 2026 and Winter/Spring/Summer 2027 are all "2026". */
function termInfo(termId: string): { quarter: Quarter; year: number } | null {
  const [y, suffix] = termId.split('-')
  const quarter = SUFFIX[suffix]
  if (!quarter) return null
  return { quarter, year: quarter === 'Fall' ? Number(y) : Number(y) - 1 }
}

/** The WebSoc term id for a quarter of an academic year (Winter of 2026–27 → "2027-03"). */
function termId(year: number, quarter: Quarter): string | null {
  if (quarter === 'Summer') return null // three summer sessions; never "exact"
  return quarter === 'Fall' ? `${year}-92` : `${year + 1}-${quarter === 'Winter' ? '03' : '14'}`
}

export interface SeasonStats {
  offered: number // academic years the course ran in this quarter
  observed: number // academic years we have schedule data for this quarter
  recent: boolean // ran in this quarter within the last two observed years
  since: number | null // earliest academic year with data for this quarter
}

export type Availability =
  | { kind: 'confirmed'; term: string } // in a published schedule for that exact term
  | { kind: 'not-scheduled'; term: string } // that term is published and the course isn't in it
  | { kind: 'likely' | 'sometimes' | 'rare' | 'unlikely'; stats: SeasonStats }
  | { kind: 'new' } // course appeared after the last time this quarter had data (new or renamed)
  | { kind: 'no-data' }

export interface OfferingIndex {
  seasons: (courseId: string) => Record<Quarter, SeasonStats>
  availability: (courseId: string, quarter: Quarter, academicYear?: number) => Availability
  lastOffered: (courseId: string) => string | null
}

export function buildOfferingIndex(data: Offerings): OfferingIndex {
  const published = new Set(data.terms.map((t) => t.id))
  const termName = new Map(data.terms.map((t) => [t.id, t.name]))
  // Which academic years have data for each quarter (summer counted once per year).
  const observedYears: Record<Quarter, number[]> = { Fall: [], Winter: [], Spring: [], Summer: [] }
  for (const t of data.terms) {
    const info = termInfo(t.id)
    if (info && !observedYears[info.quarter].includes(info.year)) observedYears[info.quarter].push(info.year)
  }
  for (const q of Object.keys(observedYears) as Quarter[]) observedYears[q].sort((a, b) => b - a)

  const cache = new Map<string, Record<Quarter, SeasonStats>>()
  const seasons = (courseId: string) => {
    let stats = cache.get(courseId)
    if (!stats) {
      const ran: Record<Quarter, Set<number>> = { Fall: new Set(), Winter: new Set(), Spring: new Set(), Summer: new Set() }
      let first = Infinity
      for (const t of data.courses[courseId] ?? []) {
        const info = termInfo(t)
        if (info) { ran[info.quarter].add(info.year); first = Math.min(first, info.year) }
      }
      // Only count years since the course first appeared, so new or renamed courses
      // (e.g. SWE 43, formerly IN4MATX 43) aren't penalised for years before they existed.
      stats = Object.fromEntries(
        (Object.keys(ran) as Quarter[]).map((q) => {
          const years = observedYears[q].filter((y) => y >= first)
          return [q, {
            offered: ran[q].size,
            observed: years.length,
            recent: years.slice(0, 2).some((y) => ran[q].has(y)),
            since: years.at(-1) ?? null,
          }]
        }),
      ) as Record<Quarter, SeasonStats>
      cache.set(courseId, stats)
    }
    return stats
  }

  const availability = (courseId: string, quarter: Quarter, academicYear?: number): Availability => {
    if (!data.courses[courseId]) return { kind: 'no-data' }
    const exact = academicYear !== undefined ? termId(academicYear, quarter) : null
    if (exact && published.has(exact)) {
      const term = termName.get(exact) ?? exact
      return data.courses[courseId].includes(exact) ? { kind: 'confirmed', term } : { kind: 'not-scheduled', term }
    }
    const stats = seasons(courseId)[quarter]
    if (!stats.observed) return { kind: 'new' }
    const rate = stats.observed ? stats.offered / stats.observed : 0
    // Recency matters: a course that stopped running two years ago shouldn't look "likely".
    const kind = rate >= 0.75 && stats.recent ? 'likely' : rate >= 0.3 && stats.recent ? 'sometimes' : stats.offered > 0 ? 'rare' : 'unlikely'
    return { kind, stats }
  }

  const lastOffered = (courseId: string) => {
    const terms = data.courses[courseId]
    return terms?.length ? termName.get(terms[0]) ?? terms[0] : null // build_web_data writes newest first
  }

  return { seasons, availability, lastOffered }
}

/** Plan-year labels are "2026–27" when generated, or "Year N" when not tied to a calendar. */
export function academicYearOf(label: string): number | undefined {
  const m = /^(\d{4})/.exec(label)
  return m ? Number(m[1]) : undefined
}

/** Short warning for a planned course, or null when it's fine to plan there. */
export function availabilityWarning(a: Availability, quarter: Quarter): string | null {
  switch (a.kind) {
    case 'not-scheduled': return `Not on the ${a.term} schedule`
    // `since` is an academic year; Winter/Spring/Summer of 2020–21 happen in calendar 2021.
    case 'unlikely': return a.stats.since !== null ? `Not offered in ${quarter} since ${quarter === 'Fall' ? a.stats.since : a.stats.since + 1}` : null
    case 'rare': return `Offered in ${a.stats.offered} of ${a.stats.observed} ${quarter}s${a.stats.recent ? '' : ', not recently'}`
    default: return null
  }
}

/** Whether the plan generator may place a course in this quarter. */
export function schedulable(a: Availability): boolean {
  if (a.kind === 'not-scheduled' || a.kind === 'unlikely') return false
  // Ran in this quarter before but not in the last two years: treat as discontinued there.
  return !(a.kind === 'rare' && !a.stats.recent)
}

/**
 * Extra cost for suggesting a course as an elective, from its offering history (0 = runs every
 * quarter, Infinity = not offered since our data starts, i.e. probably retired).
 */
export function offeringCost(index: OfferingIndex, courseId: string): number {
  const seasons = index.seasons(courseId)
  const regular = (['Fall', 'Winter', 'Spring'] as const).map((q) => seasons[q])
  const offered = regular.reduce((s, x) => s + x.offered, 0)
  const observed = regular.reduce((s, x) => s + x.observed, 0)
  if (!offered) return Infinity
  const recent = regular.some((x) => x.recent)
  return (1 - offered / Math.max(observed, 1)) + (recent ? 0 : 3)
}
