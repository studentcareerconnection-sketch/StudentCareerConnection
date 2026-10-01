// "My programs": pick majors, minors and specializations from a searchable list.
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Icon from '../components/Icon'
import { usePrograms } from '../data'
import { usePlanner } from '../store'
import type { ProgramSummary } from '../types'

const DEGREE_LABEL: Record<string, string> = { bs: 'B.S.', ba: 'B.A.', bfa: 'B.F.A.', bmus: 'B.Mus.', minor: 'Minor', spec: 'Specialization' }
const FILTERS = { all: 'All programs', major: 'Majors', minor: 'Minors' } as const
const shortName = (name: string) => name.replace(/, (B\.\w+\.|Minor)$/, '')

export default function Setup() {
  const { data: programs, error } = usePrograms()
  const { programIds, setPrograms, completed } = usePlanner()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<keyof typeof FILTERS>('all')
  const navigate = useNavigate()

  // Specializations are picked under their major, not from the main list.
  const listed = useMemo(() => (programs ?? []).filter((p) => p.degree !== 'spec'), [programs])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return listed.filter((p) =>
      (!q || p.name.toLowerCase().includes(q)) &&
      (filter === 'all' || (filter === 'minor') === (p.degree === 'minor')))
  }, [listed, query, filter])

  const byId = useMemo(() => new Map((programs ?? []).map((p) => [p.id, p])), [programs])
  const toggle = (id: string) => {
    if (programIds.includes(id)) {
      // Removing a major also removes its specialization.
      setPrograms(programIds.filter((p) => p !== id && byId.get(p)?.majorId !== id))
    } else {
      setPrograms([...programIds, id])
    }
  }
  const setSpecialization = (major: ProgramSummary, specId: string) =>
    setPrograms([...programIds.filter((p) => byId.get(p)?.majorId !== major.id), ...(specId ? [specId] : [])])

  if (error) return <div className="loading-state"><h2>We couldn’t load programs.</h2><p>{error.message}</p><button className="primary" onClick={() => location.reload()}>Try again</button></div>

  const chosen = programIds.map((id) => byId.get(id)).filter((p) => p !== undefined && p.degree !== 'spec') as ProgramSummary[]
  const missingSpec = chosen.filter((p) => p.specializationRequired && !programIds.some((id) => byId.get(id)?.majorId === p.id))

  return <>
    <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>My programs</strong></div><span className="autosave"><span className="saved-dot" />All changes saved locally</span></header>
    <main className="page setup-page">
      <div className="setup-intro">
        <div className="eyebrow">START WITH WHERE YOU’RE HEADED</div>
        <h1>Choose your programs.</h1>
        <p>Pick a major, and add a second major or minors if you have them. Your roadmap and plan update as you choose.</p>
      </div>

      <div className="setup-grid">
        <section className="program-picker">
          <div className="program-search"><Icon name="search" size={17} /><input aria-label="Search programs" placeholder={`Search ${listed.length || ''} UCI majors and minors…`} value={query} onChange={(e) => setQuery(e.target.value)} /></div>
          <div className="program-filter">{(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((key) => <button key={key} className={filter === key ? 'active' : ''} onClick={() => setFilter(key)}>{FILTERS[key]}</button>)}</div>
          <div className="program-list">
            {!programs && <p className="empty-state">Loading programs…</p>}
            {programs && !filtered.length && <p className="empty-state">No programs match “{query}”.</p>}
            {filtered.map((p) => <label key={p.id} className={programIds.includes(p.id) ? 'checked' : ''}>
              <input type="checkbox" checked={programIds.includes(p.id)} onChange={() => toggle(p.id)} />
              <span>{shortName(p.name)}</span>
              <small>{DEGREE_LABEL[p.degree] ?? p.degree}</small>
            </label>)}
          </div>
        </section>

        <aside className="selection-card">
          <h2>Your path</h2>
          <p>Requirements from every program you choose are combined into one roadmap.</p>
          {chosen.length ? chosen.map((p) => {
            const specs = (p.specializations ?? []).map((id) => byId.get(id)).filter((s) => s !== undefined) as ProgramSummary[]
            const current = programIds.find((id) => byId.get(id)?.majorId === p.id) ?? ''
            return <div className="selected-program" key={p.id}>
              <div className="selected-program-main">
                <span>{p.name}</span>
                {specs.length > 0 && <select aria-label={`Specialization for ${p.name}`} value={current} onChange={(e) => setSpecialization(p, e.target.value)}>
                  <option value="">{p.specializationRequired ? 'Choose a specialization (required)' : 'No specialization'}</option>
                  {specs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>}
              </div>
              <button aria-label={`Remove ${p.name}`} onClick={() => toggle(p.id)}>×</button>
            </div>
          }) : <p className="selection-empty">Nothing selected yet.</p>}
          {missingSpec.length > 0 && <p className="selection-warning">{missingSpec.map((p) => shortName(p.name)).join(', ')} require{missingSpec.length === 1 ? 's' : ''} a specialization.</p>}
          <button className="primary full" disabled={!programIds.length} onClick={() => navigate('/roadmap')}>See my roadmap<Icon name="arrow" size={16} /></button>
          <div className="setup-credit">
            <h3>Already have credit?</h3>
            <p>{completed.length ? `${completed.length} course${completed.length > 1 ? 's' : ''} marked as completed.` : 'AP, transfer or courses you’ve finished at UCI.'} Search for a course on the roadmap and mark it completed.</p>
            <Link to="/roadmap">Go to course roadmap ↗</Link>
          </div>
        </aside>
      </div>
    </main>
  </>
}
