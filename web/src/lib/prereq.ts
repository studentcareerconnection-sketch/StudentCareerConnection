// Evaluating registrar prerequisite trees (AND / OR / NOT nodes) against a plan.
import type { PrereqNode } from '../types'

export interface PrereqContext {
  before: Set<string> // courses finished in earlier quarters (or marked completed)
  same: Set<string> // courses in the same quarter (satisfy corequisites)
  /**
   * Whether a course still exists. Registrar prerequisites can name retired numbers
   * ("PSYCH 7A or PSCI 9", both renamed PSY in 2026); those count as 'unknown', not 'unmet',
   * so a student isn't blocked by a course nobody can take any more.
   */
  exists?: (courseId: string) => boolean
}

export type PrereqResult = 'met' | 'unmet' | 'unknown'

/**
 * Evaluate a registrar prerequisite tree. Exams, standing, and major restrictions can't be
 * checked from the plan alone, so they count as 'unknown' rather than blocking.
 */
export function evaluate(node: PrereqNode | null, ctx: PrereqContext): PrereqResult {
  if (!node) return 'met'
  if ('and' in node) {
    const r = node.and.map((n) => evaluate(n, ctx))
    return r.includes('unmet') ? 'unmet' : r.includes('unknown') ? 'unknown' : 'met'
  }
  if ('or' in node) {
    const r = node.or.map((n) => evaluate(n, ctx))
    return r.includes('met') ? 'met' : r.includes('unknown') ? 'unknown' : 'unmet'
  }
  if ('course' in node) {
    if (node.recommended) return 'met'
    if (ctx.before.has(node.course)) return 'met'
    if (node.coreq && ctx.same.has(node.course)) return 'met'
    return ctx.exists && !ctx.exists(node.course) ? 'unknown' : 'unmet'
  }
  if ('not' in node) return ctx.before.has(node.not) || ctx.same.has(node.not) ? 'unmet' : 'met'
  return 'unknown'
}

/** True when the tree can only be satisfied by something outside UCI coursework (e.g. an AP score). */
export function needsExternal(node: PrereqNode | null): boolean {
  if (!node) return false
  if ('and' in node) return node.and.some(needsExternal)
  if ('or' in node) return node.or.every(needsExternal)
  return 'exam' in node || 'other' in node
}

/** Human-readable one-liner for a tree, e.g. "(I&C SCI 32 or I&C SCI H32) and MATH 2A". */
export function describe(node: PrereqNode | null, top = true): string {
  if (!node) return ''
  if ('and' in node || 'or' in node) {
    const [op, parts] = 'and' in node ? ['and', node.and] : ['or', node.or]
    const s = parts.map((n) => describe(n, false)).join(` ${op} `)
    return top ? s : `(${s})`
  }
  if ('course' in node) return node.course + (node.coreq ? ' (coreq)' : '')
  if ('exam' in node) return `${node.exam}${node.min_score ? ` ≥ ${node.min_score}` : ''}`
  if ('not' in node) return `not ${node.not}`
  return node.other
}
