// Shapes of the files produced by build_web_data.py (web/public/data/).

export type PrereqNode =
  | { and: PrereqNode[] }
  | { or: PrereqNode[] }
  | { course: string; min_grade?: string; coreq: boolean; recommended: boolean }
  | { exam: string; min_score?: string }
  | { not: string }
  | { other: string }

export interface Course {
  title: string
  dept: string
  units: [number | null, number | null]
  ge: string[]
  description: string
  prereq: PrereqNode | null
  prereq_text: string
  restriction: string
  same_as: string[]
}

export type CourseMap = Record<string, Course>

export interface Offerings {
  terms: { id: string; name: string }[]
  courses: Record<string, string[]>
}

export type Degree = 'bs' | 'ba' | 'bfa' | 'bmus' | 'minor' | 'spec'

export interface ProgramSummary {
  id: string // Anteater/DegreeWorks id ("BS-201", "459", "BS-201A") or a catalogue slug for fallbacks
  name: string
  degree: Degree
  majorId?: string // specializations: the major they belong to
  specializationRequired?: boolean
  specializations?: string[]
  legacyId?: string // catalogue slug used by plans saved before the switch to Anteater API
}

/**
 * Requirement tree (build_web_data.py / scrapers/program_tree.py). Mostly from Anteater API,
 * which scrapes DegreeWorks; catalogue-only programs are converted to the same shape.
 */
export type ReqNode =
  | { id: string; label: string; type: 'course'; count: number; courses: string[]; reusable: boolean } // take `count` courses
  | { id: string; label: string; type: 'units'; count: number; courses: string[]; reusable: boolean } // earn `count` units
  | { id: string; label: string; type: 'group'; count: number; children: ReqNode[] } // satisfy `count` children
  | { id: string; label: string; type: 'marker' } // checked off by hand (e.g. Entry Level Writing)

export interface ReqBlock {
  name: string
  catalogYear?: string | null
  requirements: ReqNode[]
}

export interface Program extends ProgramSummary {
  source: 'anteater' | 'catalogue'
  catalogYear: string | null
  url: string | null
  requirements: ReqNode[]
  schoolRequirements: ReqBlock | null
  sample_plan: { year: string; term: string; items: string[] }[]
}

/** University-wide blocks (GE, UC) that apply to every undergraduate degree. */
export type UgradRequirements = Record<string, ReqBlock>

export const QUARTERS = ['Fall', 'Winter', 'Spring', 'Summer'] as const
export type Quarter = (typeof QUARTERS)[number]
