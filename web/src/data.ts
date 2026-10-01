// Loading the static data files in public/data/ (built by build_web_data.py).
// The app never calls an external API at runtime; everything comes from these JSON files.
import { useEffect, useState } from 'react'
import { usePlanner } from './store'
import type { CourseMap, Offerings, Program, ProgramSummary, UgradRequirements } from './types'

// Each file is fetched once per page load and shared by every component that asks for it.
const cache = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    const p = fetch(`${import.meta.env.BASE_URL}data/${path}`).then((r) => {
      if (!r.ok) throw new Error(`Failed to load ${path}: ${r.status}`)
      return r.json()
    })
    p.catch(() => cache.delete(path)) // allow a retry after a failure
    cache.set(path, p)
  }
  return cache.get(path) as Promise<T>
}

function useData<T>(path: string | null): { data: T | undefined; error: Error | undefined } {
  const [state, setState] = useState<{ path: string | null; data?: T; error?: Error }>({ path })
  useEffect(() => {
    if (!path) return
    let live = true
    load<T>(path).then(
      (data) => live && setState({ path, data }),
      (error: Error) => live && setState({ path, error }),
    )
    return () => {
      live = false
    }
  }, [path])
  // Ignore results that belong to a previous path.
  return state.path === path ? { data: state.data, error: state.error } : { data: undefined, error: undefined }
}

export const useCourses = () => useData<CourseMap>('courses.json')
export const useOfferings = () => useData<Offerings>('offerings.json')
export const usePrograms = () => useData<ProgramSummary[]>('programs.json')
export const useProgram = (id: string | null) => useData<Program>(id ? `programs/${id}.json` : null)
export const useUgrad = () => useData<UgradRequirements>('ugrad.json')

export function useSelectedPrograms(ids: string[]) {
  const key = ids.join('|')
  const [state, setState] = useState<{ key: string; data?: Program[]; error?: Error }>({ key: '' })
  useEffect(() => {
    let live = true
    Promise.all(key.split('|').filter(Boolean).map((id) => load<Program>(`programs/${id}.json`))).then(
      (data) => live && setState({ key, data }),
      (error: Error) => live && setState({ key, error }),
    )
    return () => { live = false }
  }, [key])
  return state.key === key ? state : { key }
}

/**
 * Plans saved before the switch to Anteater API stored catalogue slugs ("computerscience_bs").
 * Swap them for the new ids ("BS-201") once the program index has loaded.
 */
export function useLegacyProgramMigration() {
  const { data: programs } = usePrograms()
  const programIds = usePlanner((s) => s.programIds)
  const setPrograms = usePlanner((s) => s.setPrograms)
  useEffect(() => {
    if (!programs) return
    const valid = new Set(programs.map((p) => p.id))
    const legacy = new Map(programs.filter((p) => p.legacyId).map((p) => [p.legacyId!, p.id]))
    const next = [...new Set(programIds.map((id) => (valid.has(id) ? id : legacy.get(id) ?? id)).filter((id) => valid.has(id)))]
    if (next.join('|') !== programIds.join('|')) setPrograms(next)
  }, [programs, programIds, setPrograms])
}
