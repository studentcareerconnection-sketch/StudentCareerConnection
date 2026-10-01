// Course roadmap logic: which courses the chosen programs need, their prerequisite
// order, an auto-generated quarter-by-quarter plan, and the graph layout for the roadmap view.
import type { CourseMap, PrereqNode, Program, Quarter, UgradRequirements } from '../types'
import type { PlanYear } from '../store'
import { evaluate } from './prereq.ts'
import { allCourses, requiredCourses, resolveBlock, type BlockProgress, type ResolveContext } from './requirements'

export function prerequisites(node: PrereqNode | null): string[] {
  if (!node) return []
  if ('and' in node) return node.and.flatMap(prerequisites)
  if ('or' in node) return node.or.flatMap(prerequisites)
  return 'course' in node && !node.recommended ? [node.course] : []
}

/** Prerequisite courses that must be finished in an earlier quarter (not coreqs or recommendations). */
function requiredBefore(node: PrereqNode | null): string[] {
  if (!node) return []
  if ('and' in node) return node.and.flatMap(requiredBefore)
  if ('or' in node) return node.or.flatMap(requiredBefore)
  return 'course' in node && !node.recommended && !node.coreq ? [node.course] : []
}

/**
 * Corequisites that are always required (same quarter or earlier). Only AND paths count: a coreq
 * that's one alternative of an OR ("PHYSICS 7C (coreq) or SAT Math or MATH 2A" for CHEM 1A)
 * mustn't tie the two courses together.
 */
function corequisites(node: PrereqNode | null): string[] {
  if (!node) return []
  if ('and' in node) return node.and.flatMap(corequisites)
  if ('or' in node) return []
  return 'course' in node && node.coreq ? [node.course] : []
}

/** Courses this one can't be combined with ("NO COGS 9A"), usually the same course under another number. */
function exclusions(node: PrereqNode | null): string[] {
  if (!node) return []
  if ('and' in node) return node.and.flatMap(exclusions)
  if ('or' in node) return node.or.flatMap(exclusions)
  return 'not' in node ? [node.not] : []
}

// Conditions that stand in for prior preparation (AP, placement, SAT/ACT) rather than
// permission. A student either meets them or takes the alternative course.
const PREPARATION_RE = /PLACEMENT|\bSAT\b|\bACT\b|^AP\b|EXAM|SCORE/i
const isPreparation = (node: PrereqNode) => 'exam' in node || ('other' in node && PREPARATION_RE.test(node.other))

/** 100–199 course numbers ("COMPSCI 161", "I&C SCI 139W", "BIO SCI H190") are upper-division. */
function isUpperDivision(id: string): boolean {
  const n = parseInt(id.slice(id.lastIndexOf(' ') + 1).replace(/^[A-Z]+/, ''), 10)
  return n >= 100 && n < 200
}

export function courseStatus(id: string, courses: CourseMap, completed: Set<string>) {
  if (completed.has(id)) return 'completed'
  const course = courses[id]
  if (!course) return 'unknown'
  if (!course.prereq && course.prereq_text) return 'unknown'
  const result = evaluate(course.prereq, { before: completed, same: new Set(), exists: (c) => !!courses[c] })
  return result === 'met' ? 'available' : result === 'unmet' ? 'locked' : 'unknown'
}

export interface ProgramTargets {
  required: string[] // courses the plan should contain (core + chosen/suggested electives)
  pool: string[] // every course any requirement could use
  blocks: BlockProgress[] // per-requirement progress for the selected programs (+ GE/UC when given)
}

/**
 * Courses needed for the selected programs, from their requirement trees. Electives are filled
 * with the student's picks first, then suggestions. University-wide blocks (GE/UC) are tracked
 * for progress but never auto-suggested: random GE picks would just clutter the plan.
 */
export function programTargets(
  programs: Program[], completed: Set<string>, courses: CourseMap,
  ctx: Partial<Pick<ResolveContext, 'chosen' | 'planned' | 'offeringCost'>> = {},
  ugrad: UgradRequirements = {},
): ProgramTargets {
  const full: ResolveContext = { courses, completed, chosen: ctx.chosen ?? new Set(), planned: ctx.planned ?? new Set(), offeringCost: ctx.offeringCost }
  const blocks: BlockProgress[] = []
  for (const p of programs) {
    blocks.push(resolveBlock(p.id, { name: p.name, requirements: p.requirements }, full))
    if (p.schoolRequirements) blocks.push(resolveBlock(`${p.id}:school`, p.schoolRequirements, full))
  }
  const programBlocks = [...blocks]
  for (const [key, block] of Object.entries(ugrad)) blocks.push(resolveBlock(key, block, full, false))
  return {
    required: requiredCourses(programBlocks, completed),
    pool: allCourses(programs.flatMap((p) => [{ name: p.name, requirements: p.requirements }, ...(p.schoolRequirements ? [p.schoolRequirements] : [])]))
      .filter((id) => courses[id]),
    blocks,
  }
}

/** Pick one viable OR branch, preferring credits and courses already in the degree. */
function branch(node: PrereqNode | null, known: Set<string>, courses: CourseMap): string[] {
  if (!node || evaluate(node, { before: known, same: new Set(), exists: (c) => !!courses[c] }) === 'met') return []
  // Never add a retired course (not in the catalogue) as a prerequisite to take.
  if ('course' in node) return node.recommended || !courses[node.course] ? [] : [node.course]
  if ('and' in node) return [...new Set(node.and.flatMap((n) => branch(n, known, courses)))]
  if ('or' in node) {
    // "MATH 1B or placement exam": assume the student places in rather than adding a
    // remedial course; the course stays flagged as conditional in the plan.
    if (node.or.some(isPreparation) && !node.or.some((n) => 'course' in n && known.has(n.course))) return []
    const options = node.or.map((n) => ({ ids: branch(n, known, courses), node: n }))
    const cost = (option: typeof options[number]) => option.ids.length ? option.ids.reduce((sum, id) => sum + (known.has(id) ? 0 : courses[id] ? 1 : 100), 0) : 50
    return options.sort((a, b) => cost(a) - cost(b))[0]?.ids ?? []
  }
  return []
}

export function expandTargets(targets: string[], completed: Set<string>, courses: CourseMap) {
  const result = new Set(targets)
  const known = new Set([...completed, ...targets])
  const visiting = new Set<string>()
  const visit = (id: string) => {
    if (visiting.has(id) || completed.has(id)) return
    visiting.add(id)
    // The target itself must not satisfy its own prerequisite tree.
    const available = new Set(known); available.delete(id)
    for (const dep of branch(courses[id]?.prereq ?? null, available, courses)) {
      result.add(dep); known.add(dep); visit(dep)
    }
    // Existing target dependencies still need their own ancestors.
    prerequisites(courses[id]?.prereq ?? null).filter((dep) => known.has(dep)).forEach(visit)
  }
  targets.forEach(visit)
  return [...result]
}

export interface PlanOptions { startYear: number; startQuarter: 'Fall' | 'Winter' | 'Spring'; quarters: number; maxUnits: number; summer: boolean }
export interface PlanResult { years: PlanYear[]; remaining: string[]; conditional: string[] }

export function generatePlan(
  targets: string[], completed: Set<string>, courses: CourseMap, options: PlanOptions,
  offeredIn: (id: string, quarter: Quarter, academicYear: number) => boolean = () => true,
): PlanResult {
  const pending = new Set(expandTargets(targets, completed, courses).filter((id) => !completed.has(id)))
  const before = new Set(completed)
  const years: PlanYear[] = []
  const conditional: string[] = []
  const seasons: Quarter[] = options.summer ? ['Fall', 'Winter', 'Spring', 'Summer'] : ['Fall', 'Winter', 'Spring']
  let season = seasons.indexOf(options.startQuarter)
  let year = 0
  for (let i = 0; i < options.quarters; i++) {
    if (!years[year]) years[year] = { label: `${options.startYear + year}–${String(options.startYear + year + 1).slice(-2)}`, quarters: { Fall: [], Winter: [], Spring: [], Summer: [] } }
    const quarter = seasons[season]
    const selected: string[] = []
    let units = 0
    // Highest fan-out first so foundation courses open subsequent quarters.
    const priority = (id: string) => [...pending].filter((other) => prerequisites(courses[other]?.prereq ?? null).includes(id)).length
    const ordered = [...pending].sort((a, b) => priority(b) - priority(a))
    // Courses that list each other as prerequisites (NUR SCI 108W <-> 109A, a cohort taken
    // together) can never come "first"; schedule each such cycle as one bundle.
    const pendingDeps = (id: string) => requiredBefore(courses[id]?.prereq ?? null).filter((d) => d !== id && pending.has(d))
    const reach = (from: string) => {
      const seen = new Set<string>()
      const stack = [from]
      while (stack.length) for (const d of pendingDeps(stack.pop()!)) if (!seen.has(d)) { seen.add(d); stack.push(d) }
      return seen
    }
    // Corequisites in the plan join the bundle too (NUR SCI 108W, 109A and 119 are each other's coreqs).
    const bundleOf = (id: string) => {
      const bundle = new Set([id])
      const queue = [id]
      while (queue.length) {
        const x = queue.pop()!
        const cycle = [...reach(x)].filter((d) => reach(d).has(x))
        const coreqs = corequisites(courses[x]?.prereq ?? null).filter((d) => pending.has(d))
        for (const d of [...cycle, ...coreqs]) if (!bundle.has(d)) { bundle.add(d); queue.push(d) }
      }
      return [...bundle]
    }

    for (const id of ordered) {
      if (selected.includes(id)) continue
      const bundle = bundleOf(id)
      const together = new Set([...selected, ...bundle])
      let ok = true
      let load = 0
      const flagged: string[] = []
      for (const member of bundle) {
        const c = courses[member]
        if (!c || c.units[0] === null) { ok = false; break }
        // Bundle members satisfy each other's prerequisites.
        const done = new Set([...before, ...bundle.filter((x) => x !== member)])
        const result = evaluate(c.prereq, { before: done, same: together, exists: (x) => !!courses[x] })
        // A prerequisite that is itself in the plan must come first, even when an exam
        // alternative ("MATH 2A or AP Calculus") would otherwise leave the result 'unknown'.
        const waiting = requiredBefore(c.prereq).some((dep) => dep !== member && pending.has(dep) && !bundle.includes(dep))
        // Upper-division courses gated on standing/writing we can't verify (I&C SCI 139W needs
        // Lower-Division Writing) shouldn't land in the plan's first year.
        const tooEarly = i < 3 && result === 'unknown' && isUpperDivision(member)
        // Checked both ways: PSY 9 says "NO COGS 9A", but COGS 9A doesn't mention PSY 9.
        const scheduled = [...before, ...selected, ...bundle.filter((x) => x !== member)]
        const excluded = exclusions(c.prereq).some((x) => scheduled.includes(x)) ||
          scheduled.some((other) => exclusions(courses[other]?.prereq ?? null).includes(member))
        if (result === 'unmet' || waiting || tooEarly || excluded || !offeredIn(member, quarter, options.startYear + year)) { ok = false; break }
        // Use the upper end for variable-unit courses to avoid exceeding the cap.
        load += c.units[1] ?? c.units[0]
        if (result === 'unknown' || (!c.prereq && c.prereq_text)) flagged.push(member)
      }
      // A bundle larger than the unit cap gets a quarter to itself.
      const fits = units + load <= options.maxUnits || (bundle.length > 1 && !selected.length)
      if (!ok || !fits) continue
      selected.push(...bundle); units += load
      conditional.push(...flagged)
    }
    years[year].quarters[quarter] = selected
    selected.forEach((id) => { before.add(id); pending.delete(id) })
    season++
    if (season === seasons.length) { season = 0; year++ }
  }
  return { years, remaining: [...pending], conditional }
}

export function graphLayout(ids: string[], courses: CourseMap) {
  const included = new Set(ids)
  const levels = new Map<string, number>()
  const level = (id: string, seen = new Set<string>()): number => {
    if (levels.has(id)) return levels.get(id)!
    if (seen.has(id)) return 0
    const next = new Set(seen).add(id)
    const deps = prerequisites(courses[id]?.prereq ?? null).filter((dep) => included.has(dep) && dep !== id)
    const value = Math.min(10, deps.length ? 1 + Math.max(...deps.map((dep) => level(dep, next))) : 0)
    levels.set(id, value)
    return value
  }
  ids.forEach((id) => level(id))
  const rows = new Map<number, number>()
  return ids.map((id) => {
    const column = levels.get(id) ?? 0
    const row = rows.get(column) ?? 0
    rows.set(column, row + 1)
    return { id, column, x: 40 + column * 280, y: 80 + row * 132 }
  })
}
