// Degree-requirement progress: matches a program's requirement tree against completed,
// chosen and planned courses, and suggests courses for the gaps.
import type { CourseMap, ReqBlock, ReqNode } from '../types'
import { evaluate, needsExternal } from './prereq'

export type PickSource = 'completed' | 'chosen' | 'planned' | 'suggested'

export interface NodeProgress {
  node: ReqNode
  picks: string[] // courses counted toward this node (course/units nodes)
  sources: Record<string, PickSource>
  need: number
  done: number // completed so far, in the node's own measure
  filled: number // completed + chosen + planned + suggested
  committed: number // completed + chosen + planned (what the student has actually lined up)
  complete: boolean
  selected: boolean // counts toward its parent group (false = an unused alternative)
  children?: NodeProgress[]
}

export interface BlockProgress {
  key: string // program id, or "GE" / "UC"
  name: string
  nodes: NodeProgress[]
}

export interface ResolveContext {
  courses: CourseMap
  completed: Set<string> // also holds `marker:<id>` for requirements checked off by hand
  chosen: Set<string> // courses the student explicitly picked ("+ Include in my path")
  planned: Set<string>
  /** Extra cost for suggesting a course (e.g. rarely offered); Infinity = never suggest. */
  offeringCost?: (id: string) => number
}

export const markerKey = (id: string) => `marker:${id}`

const RANK: Record<PickSource, number> = { completed: 0, chosen: 1, planned: 2, suggested: 3 }

interface State {
  used: Set<string> // courses already counted by another requirement in this block
  known: Set<string> // courses the plan will contain, for prerequisite-aware suggestions
}
const clone = (s: State): State => ({ used: new Set(s.used), known: new Set(s.known) })

/**
 * Work out how each requirement is (or could be) satisfied. Courses already completed, picked
 * by the student, or in the plan count first; remaining gaps get suggestions that are cheap to
 * reach (prerequisites mostly met) and regularly offered. Groups pick the children closest to
 * done. Within a block a course counts once (unless the requirement is marked reusable, like
 * CS 145 in the CS flexible core); separate blocks (major, minor, GE) may share courses.
 */
export function resolveBlock(key: string, block: ReqBlock, ctx: ResolveContext, suggest = true): BlockProgress {
  const { courses, completed, chosen, planned } = ctx
  const sourceOf = (id: string): PickSource =>
    completed.has(id) ? 'completed' : chosen.has(id) ? 'chosen' : planned.has(id) ? 'planned' : 'suggested'
  const unitsOf = (id: string) => courses[id]?.units[0] ?? 4

  const costOf = (id: string, known: Set<string>): number => {
    const c = courses[id]
    if (!c) return Infinity // retired or unknown course
    const prereq = evaluate(c.prereq, { before: known, same: new Set(), exists: (x) => !!courses[x] })
    return 1 + (prereq === 'met' ? 0 : prereq === 'unknown' ? 0.5 : 2) + (needsExternal(c.prereq) ? 10 : 0) + (ctx.offeringCost?.(id) ?? 0)
  }

  const resolve = (node: ReqNode, state: State): NodeProgress => {
    if (node.type === 'marker') {
      const done = completed.has(markerKey(node.id)) ? 1 : 0
      return { node, picks: [], sources: {}, need: 1, done, filled: done, committed: done, complete: !!done, selected: true }
    }

    if (node.type === 'group') {
      // Try every child on a copy of the state, then commit the most promising `count` of them.
      const trials = node.children.map((child, i) => ({ i, trial: resolve(child, clone(state)) }))
      const score = (p: NodeProgress) => [
        p.complete ? 0 : 1,
        -(p.done / Math.max(p.need, 1)),
        -p.committed / Math.max(p.need, 1),
        p.filled >= p.need ? 0 : 1, // can it be filled at all?
        suggestionCost(p, state.known),
      ]
      const ranked = [...trials].sort((a, b) => compare(score(a.trial), score(b.trial)))
      const chosenIdx = new Set(ranked.slice(0, node.count).map((t) => t.i))
      const children = node.children.map((child, i) =>
        chosenIdx.has(i) ? resolve(child, state) : { ...trials[i].trial, selected: false, picks: [], sources: {}, filled: 0, committed: 0 })
      const selected = children.filter((c) => c.selected)
      return {
        node, picks: [], sources: {}, children, selected: true,
        need: node.count,
        done: selected.filter((c) => c.complete).length,
        filled: selected.filter((c) => c.filled >= c.need).length,
        committed: selected.filter((c) => c.committed >= c.need).length,
        complete: selected.filter((c) => c.complete).length >= node.count,
      }
    }

    // course / units
    const measure = (ids: string[]) => (node.type === 'units' ? ids.reduce((s, id) => s + unitsOf(id), 0) : ids.length)
    const candidates = node.courses.filter((id) => !state.used.has(id))
    const picks: string[] = []
    const own = candidates.filter((id) => sourceOf(id) !== 'suggested').sort((a, b) => RANK[sourceOf(a)] - RANK[sourceOf(b)])
    for (const id of own) {
      // Planned courses only count while there's room; completed and chosen always show.
      if (sourceOf(id) === 'planned' && measure(picks) >= node.count) continue
      picks.push(id)
    }
    if (suggest) {
      // In short "X or Y" lists the first course is the program's default (I&C SCI 6N over MATH 3A).
      const orderBias = node.courses.length <= 3 ? 0.6 : 0
      const pool = candidates.filter((id) => !picks.includes(id))
        .map((id) => ({ id, cost: costOf(id, state.known) + orderBias * node.courses.indexOf(id) }))
        .filter((c) => c.cost < Infinity)
        .sort((a, b) => a.cost - b.cost || a.id.localeCompare(b.id))
      for (const { id } of pool) {
        if (measure(picks) >= node.count) break
        picks.push(id)
      }
    }
    for (const id of picks) {
      if (!node.reusable) state.used.add(id)
      state.known.add(id)
    }
    const sources = Object.fromEntries(picks.map((id) => [id, sourceOf(id)]))
    const done = measure(picks.filter((id) => sources[id] === 'completed'))
    const committed = measure(picks.filter((id) => sources[id] !== 'suggested'))
    return { node, picks, sources, need: node.count, done, filled: measure(picks), committed, complete: done >= node.count, selected: true }
  }

  const suggestionCost = (p: NodeProgress, known: Set<string>): number =>
    p.picks.filter((id) => p.sources[id] === 'suggested').reduce((s, id) => s + costOf(id, known), 0) +
    (p.children ?? []).filter((c) => c.selected).reduce((s, c) => s + suggestionCost(c, known), 0)

  const state: State = { used: new Set(), known: new Set([...completed, ...chosen, ...planned]) }
  return { key, name: block.name, nodes: block.requirements.map((n) => resolve(n, state)) }
}

function compare(a: number[], b: number[]): number {
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

/** Every course the selected requirements call for, completed ones excluded. */
export function requiredCourses(blocks: BlockProgress[], completed: Set<string>): string[] {
  const out = new Set<string>()
  const walk = (p: NodeProgress) => {
    if (!p.selected) return
    p.picks.forEach((id) => out.add(id))
    p.children?.forEach(walk)
  }
  blocks.forEach((b) => b.nodes.forEach(walk))
  return [...out].filter((id) => !completed.has(id))
}

/** Every course mentioned anywhere in these blocks (for "explore electives"). */
export function allCourses(blocks: ReqBlock[]): string[] {
  const out = new Set<string>()
  const walk = (n: ReqNode) => (n.type === 'group' ? n.children.forEach(walk) : n.type !== 'marker' && n.courses.forEach((id) => out.add(id)))
  blocks.forEach((b) => b.requirements.forEach(walk))
  return [...out]
}

/** Totals for a progress bar: leaf requirements done / needed across a block. */
export function blockTotals(block: BlockProgress): { done: number; need: number } {
  return block.nodes.reduce((t, n) => ({ done: t.done + Math.min(n.done, n.need), need: t.need + n.need }), { done: 0, need: 0 })
}
