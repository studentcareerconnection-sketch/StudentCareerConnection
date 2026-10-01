// The student's plan: chosen programs, completed courses and the quarter-by-quarter
// schedule. Kept in a zustand store and persisted to localStorage under "uci-planner".
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Quarter } from './types'

export interface PlanYear {
  label: string // "Year 1", or the academic year like "2026-27"
  quarters: Record<Quarter, string[]> // course ids
}

interface PlannerState {
  programIds: string[] // major(s) and minor(s)
  completed: string[] // courses/AP credit taken before the plan starts
  years: PlanYear[]
  extraCourses: string[]
  setYears: (years: PlanYear[]) => void
  toggleExtra: (id: string) => void

  setPrograms: (ids: string[]) => void
  toggleCompleted: (courseId: string) => void
  addCourse: (year: number, quarter: Quarter, courseId: string) => void
  removeCourse: (year: number, quarter: Quarter, courseId: string) => void
  moveCourse: (from: Slot, to: Slot, courseId: string) => void
  addYear: () => void
  removeYear: (year: number) => void
  reset: () => void
}

export interface Slot {
  year: number
  quarter: Quarter
}

const emptyYear = (i: number): PlanYear => ({
  label: `Year ${i + 1}`,
  quarters: { Fall: [], Winter: [], Spring: [], Summer: [] },
})

const initial = { programIds: [], completed: [], extraCourses: [], years: [0, 1, 2, 3].map(emptyYear) }

const updateQuarter = (years: PlanYear[], { year, quarter }: Slot, fn: (ids: string[]) => string[]) =>
  years.map((y, i) => (i === year ? { ...y, quarters: { ...y.quarters, [quarter]: fn(y.quarters[quarter]) } } : y))

// Saved to localStorage; swapping `storage` for a server-backed one is all cloud sync needs later.
export const usePlanner = create<PlannerState>()(
  persist(
    (set) => ({
      ...initial,
      setYears: (years) => set({ years }),
      toggleExtra: (id) => set((s) => ({ extraCourses: s.extraCourses.includes(id) ? s.extraCourses.filter((c) => c !== id) : [...s.extraCourses, id] })),
      setPrograms: (programIds) => set({ programIds }),
      toggleCompleted: (id) =>
        set((s) => ({ completed: s.completed.includes(id) ? s.completed.filter((c) => c !== id) : [...s.completed, id], years: s.completed.includes(id) ? s.years : s.years.map((y) => ({ ...y, quarters: Object.fromEntries(Object.entries(y.quarters).map(([q, ids]) => [q, ids.filter((c) => c !== id)])) as Record<Quarter, string[]> })) })),
      addCourse: (year, quarter, id) =>
        set((s) => ({ years: updateQuarter(s.years, { year, quarter }, (ids) => (ids.includes(id) ? ids : [...ids, id])) })),
      removeCourse: (year, quarter, id) =>
        set((s) => ({ years: updateQuarter(s.years, { year, quarter }, (ids) => ids.filter((c) => c !== id)) })),
      moveCourse: (from, to, id) =>
        set((s) => {
          const removed = updateQuarter(s.years, from, (ids) => ids.filter((c) => c !== id))
          return { years: updateQuarter(removed, to, (ids) => (ids.includes(id) ? ids : [...ids, id])) }
        }),
      addYear: () => set((s) => ({ years: [...s.years, emptyYear(s.years.length)] })),
      removeYear: (year) => set((s) => ({ years: s.years.filter((_, i) => i !== year) })),
      reset: () => set(initial),
    }),
    { name: 'uci-planner', version: 1 },
  ),
)
