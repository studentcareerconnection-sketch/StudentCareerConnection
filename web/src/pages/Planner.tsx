// The main workspace: course roadmap, quarter planner and degree requirements
// (one component, three views selected by the route).
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCourses, useOfferings, useSelectedPrograms, useUgrad } from '../data'
import { usePlanner } from '../store'
import { describe, evaluate } from '../lib/prereq'
import { courseStatus, expandTargets, generatePlan, graphLayout, prerequisites, programTargets, type PlanOptions, type PlanResult } from '../lib/roadmap'
import Icon from '../components/Icon'
import { academicYearOf, availabilityWarning, buildOfferingIndex, offeringCost, schedulable } from '../lib/offerings'
import RequirementsView from '../components/RequirementsView'
import { QUARTERS, type Quarter } from '../types'

const labels = { completed: 'Completed', available: 'Unlocked', locked: 'Locked', unknown: 'Check eligibility' }
const normalize = (s: string) => s.toLowerCase().replace(/i&c sci/g, 'ics').replace(/[^a-z0-9]/g, '')
const shortCode = (s: string) => s.replace('I&C SCI', 'ICS').replace('COMPSCI', 'CS')

export default function Planner({ view }: { view: 'roadmap' | 'plan' | 'requirements' }) {
  const { data: courses, error } = useCourses()
  const { data: offerings } = useOfferings()
  const store = usePlanner()
  const ids = store.programIds.length ? store.programIds : ['BS-201'] // explore Computer Science until a program is chosen
  const { data: programs, error: programError } = useSelectedPrograms(ids)
  const { data: ugrad } = useUgrad()
  const [selected, setSelected] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState('core')
  const [filter, setFilter] = useState('all')
  const [zoom, setZoom] = useState(0.85)
  const [showGenerator, setShowGenerator] = useState(false)
  const [options, setOptions] = useState<PlanOptions>(() => ({ startYear: new Date().getFullYear(), startQuarter: 'Fall', quarters: 12, maxUnits: 16, summer: false }))
  const [preview, setPreview] = useState<PlanResult | null>(null)
  const [notice, setNotice] = useState('')
  const [slot, setSlot] = useState('0:Fall')
  const completed = useMemo(() => new Set(store.completed), [store.completed])
  const offeringIndex = useMemo(() => (offerings ? buildOfferingIndex(offerings) : null), [offerings])
  const plannedSet = useMemo(() => new Set(store.years.flatMap((y) => QUARTERS.flatMap((q) => y.quarters[q]))), [store.years])
  const requirements = useMemo(() => programTargets(programs ?? [], completed, courses ?? {}, {
    chosen: new Set(store.extraCourses),
    planned: plannedSet,
    offeringCost: offeringIndex ? (id) => offeringCost(offeringIndex, id) : undefined,
  }, ugrad), [programs, completed, courses, store.extraCourses, plannedSet, offeringIndex, ugrad])
  const targets = useMemo(() => [...new Set([...requirements.required, ...store.extraCourses])], [requirements, store.extraCourses])
  const core = useMemo(() => expandTargets(targets, completed, courses ?? {}), [targets, completed, courses])
  const all = useMemo(() => [...new Set([...core, ...requirements.pool])].filter((id) => courses?.[id]), [core, requirements, courses])
  const visible = useMemo(() => (scope === 'core' ? core : all).filter((id) => courses?.[id] && (filter === 'all' || courseStatus(id, courses, completed) === filter)), [scope, core, all, filter, courses, completed])
  const nodes = useMemo(() => graphLayout(visible, courses ?? {}), [visible, courses])
  const results = useMemo(() => !query.trim() || !courses ? [] : Object.keys(courses).filter((id) => normalize(id + courses[id].title).includes(normalize(query))).slice(0, 12), [query, courses])

  if (error || programError) return <div className="loading-state"><h2>We couldn’t load your courses.</h2><p>{(error || programError)?.message}</p><button className="primary" onClick={() => location.reload()}>Try again</button></div>
  if (!courses || !programs) return <div className="loading-state"><span className="tiny-orbit">✳</span><h2>Mapping your possibilities…</h2><p>Loading UCI courses and degree requirements.</p></div>

  const selectedId = selected && courses[selected] ? selected : visible[0]
  const course = courses[selectedId]
  const state = courseStatus(selectedId, courses, completed)
  const directNext = Object.keys(courses).filter((id) => prerequisites(courses[id].prereq).includes(selectedId))
  const nextUnlocked = directNext.filter((id) => courseStatus(id, courses, completed) !== 'available' && courseStatus(id, courses, new Set([...completed, selectedId])) === 'available')
  const selectedPlanned = store.years.flatMap((year) => QUARTERS.filter((q) => year.quarters[q].includes(selectedId)).map((q) => `${q} ${year.label}`))
  const width = Math.max(850, ...nodes.map((n) => n.x + 270))
  const height = Math.max(430, ...nodes.map((n) => n.y + 150))
  const done = core.filter((id) => completed.has(id)).length
  const unlocked = core.filter((id) => courseStatus(id, courses, completed) === 'available').length
  const planned = new Set(store.years.flatMap((y) => Object.values(y.quarters).flat()))
  const remainingTargets = targets.filter((id) => !completed.has(id) && !planned.has(id))
  const planStatuses = new Map<string, string>()
  const before = new Set(completed)
  store.years.forEach((y, yi) => QUARTERS.forEach((q) => {
    y.quarters[q].forEach((id) => {
      const c = courses[id]
      planStatuses.set(`${yi}:${q}:${id}`, !c || (!c.prereq && c.prereq_text) ? 'unknown' : evaluate(c.prereq, { before, same: new Set(y.quarters[q]), exists: (x) => !!courses[x] }))
    })
    y.quarters[q].forEach((id) => before.add(id))
  }))
  const title = view === 'roadmap' ? 'Your next chapter, mapped.' : view === 'plan' ? 'Big goals. One quarter at a time.' : 'Every requirement, in view.'
  const sub = view === 'roadmap' ? 'Build your foundation. Unlock what comes next.' : view === 'plan' ? 'Turn your course roadmap into a plan that fits your pace.' : 'Explore your programs and choose the courses that make your path yours.'
  const openCourse = (id: string) => { setSelected(id); setQuery('') }
  const offeringNote = (id: string, q: Quarter, label: string) => offeringIndex && availabilityWarning(offeringIndex.availability(id, q, academicYearOf(label)), q)
  const offeredIn = (id: string, q: Quarter, year: number) => !offeringIndex || schedulable(offeringIndex.availability(id, q, year))
  const seasonStats = offeringIndex?.seasons(selectedId)
  const lastOffered = offeringIndex?.lastOffered(selectedId)

  return <>
    <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{view === 'roadmap' ? 'Course roadmap' : view === 'plan' ? 'Quarter planner' : 'Degree requirements'}</strong></div><span className="autosave"><span className="saved-dot" />All changes saved locally</span></header>
    <main className="page">
      <div className="page-heading"><div><div className="eyebrow">YOUR DEGREE, YOUR DIRECTION</div><h1>{title}</h1><p>{sub}</p></div><button className="primary" onClick={() => { setPreview(null); setShowGenerator(true) }}><Icon name="sparkle" size={17} />Build my plan<Icon name="arrow" size={16} /></button></div>
      <div className="program-strip"><div className="program-tags">{programs.map((p) => <Link to="/setup" className="program-tag" key={p.id}><span className="program-dot" />{p.name}<span>⌄</span></Link>)}<Link to="/setup" className="add-program">+ Add major / minor</Link></div><span className="quarter-hint">UCI · Quarter system</span></div>
      {!store.programIds.length && <div className="explore-banner">You’re exploring Computer Science. <Link to="/setup">Choose your own major and minors <span>↗</span></Link></div>}
      <div className="stats-row"><div className="stat"><span className="stat-icon green"><Icon name="check" /></span><div><strong>{done}<small> / {core.length}</small></strong><span>Path courses completed</span></div><div className="mini-progress"><i style={{ width: `${core.length ? done / core.length * 100 : 0}%` }} /></div></div><div className="stat"><span className="stat-icon amber"><Icon name="sparkle" /></span><div><strong>{unlocked}</strong><span>Courses unlocked now</span></div></div><div className="stat"><span className="stat-icon lavender"><Icon name="calendar" /></span><div><strong>{planned.size}</strong><span>Courses in your plan</span></div><Link to="/plan" aria-label="Open quarter planner">↗</Link></div></div>
      <div className="workspace-grid">
        <section className="workspace-panel">
          <div className="panel-tabs"><div><Link className={view === 'roadmap' ? 'active' : ''} to="/roadmap"><Icon name="tree" size={16} />Course roadmap</Link><Link className={view === 'plan' ? 'active' : ''} to="/plan"><Icon name="calendar" size={16} />Quarter planner</Link><Link className={view === 'requirements' ? 'active' : ''} to="/requirements"><Icon name="book" size={16} />Requirements</Link></div><span className="live-label">● LIVE</span></div>
          <div className="map-toolbar"><div className="segmented"><button className={scope === 'core' ? 'active' : ''} onClick={() => setScope('core')}>My path</button><button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>Explore electives</button></div><div className="search-wrap"><Icon name="search" size={16} /><input aria-label="Search all courses" placeholder="Find a course or add credit…" value={query} onChange={(e) => setQuery(e.target.value)} />{query && <div className="search-results">{results.length ? results.map((id) => <button key={id} onClick={() => openCourse(id)}><strong>{id}</strong><span>{courses[id].title}</span>{completed.has(id) && <Icon name="check" size={14} />}</button>) : <p>No matching courses.</p>}</div>}</div></div>
          {view === 'roadmap' && <>
            <div className="map-caption"><span><span className="small-dot" /> YOUR COURSE SKILL TREE</span><select aria-label="Filter course status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All statuses</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></div>
            <div className="graph-scroll"><div style={{ width: width * zoom, height: height * zoom }}><div className="graph-canvas" style={{ width, height, transform: `scale(${zoom})` }}>
              {[...new Set(nodes.map((n) => n.column))].map((column) => <div className="level-label" key={column} style={{ left: 40 + column * 280 }}><span>{String(column + 1).padStart(2, '0')}</span>{column === 0 ? 'FOUNDATIONS' : column < 3 ? 'BUILD YOUR SKILLS' : 'GO FURTHER'}</div>)}
              <svg className="graph-lines" width={width} height={height} aria-hidden="true">{nodes.flatMap((node) => [...new Set(prerequisites(courses[node.id]?.prereq ?? null))].map((dep) => {
                const parent = nodes.find((n) => n.id === dep)
                if (!parent) return null
                const x = parent.x + 222, y = parent.y + 49
                return <path key={`${dep}:${node.id}`} className={`${completed.has(dep) ? 'done' : ''} ${selectedId === dep || selectedId === node.id ? 'highlighted' : ''}`} d={`M${x},${y} C${x + 35},${y} ${node.x - 35},${node.y + 49} ${node.x},${node.y + 49}`} />
              }))}</svg>
              {nodes.map((node) => { const status = courseStatus(node.id, courses, completed); return <button key={node.id} onClick={() => setSelected(node.id)} className={`course-node ${status} ${selectedId === node.id ? 'selected' : ''}`} style={{ left: node.x, top: node.y }}><div className="node-top"><span>{shortCode(node.id)}</span><span className="node-status"><Icon name={status === 'completed' ? 'check' : status === 'available' ? 'arrow' : status === 'unknown' ? 'book' : 'lock'} size={14} /></span></div><div className="node-title">{courses[node.id].title}</div><div className="node-bottom"><span>{courses[node.id].units[0] ?? '?'} units</span><span>{labels[status]}</span></div>{planned.has(node.id) && <span className="planned-pin">Planned</span>}</button> })}
            </div></div>{!nodes.length && <div className="empty-state">No courses match this view. Try another status or explore electives.</div>}</div>
            <div className="map-footer"><div className="legend"><span><i className="completed" />Completed</span><span><i className="available" />Unlocked</span><span><i className="locked" />Locked</span><span><i className="unknown" />Check</span></div><div className="zoom-control"><button aria-label="Zoom out" disabled={zoom <= .5} onClick={() => setZoom(Math.max(.5, zoom - .1))}>−</button><button aria-label="Reset zoom" onClick={() => setZoom(.85)}>{Math.round(zoom * 100)}%</button><button aria-label="Zoom in" disabled={zoom >= 1.3} onClick={() => setZoom(Math.min(1.3, zoom + .1))}>+</button></div></div>
          </>}
          {view === 'plan' && <div className="plan-content"><div className="plan-advisory"><Icon name="book" size={18} /><p><strong>Your working plan</strong> · {remainingTargets.length} selected courses still need a quarter. GE, elective counts and program overlap rules need review. Future offerings are not guaranteed.</p></div>{store.years.map((year, yi) => <section className="plan-year" key={yi}><h3>{year.label}<span>{Object.values(year.quarters).flat().length} courses</span></h3><div className="quarter-grid">{QUARTERS.filter((q) => q !== 'Summer' || options.summer || year.quarters.Summer.length > 0).map((q) => <div className="quarter" key={q}><div className="quarter-title">{q}<span>{year.quarters[q].reduce((sum, id) => sum + (courses[id]?.units[1] ?? courses[id]?.units[0] ?? 0), 0)} units</span></div>{year.quarters[q].map((id) => <div className="plan-course" key={id}><button onClick={() => setSelected(id)}><strong>{shortCode(id)}</strong><span>{courses[id]?.title ?? 'Course not in catalogue'}</span>{planStatuses.get(`${yi}:${q}:${id}`) !== 'met' && <em>{planStatuses.get(`${yi}:${q}:${id}`) === 'unmet' ? 'Prerequisite conflict' : 'Eligibility needs review'}</em>}{offeringNote(id, q, year.label) && <em className="offering-warning">{offeringNote(id, q, year.label)}</em>}</button><button className="remove-course" aria-label={`Remove ${id} from ${q} ${year.label}`} onClick={() => store.removeCourse(yi, q, id)}>×</button></div>)}{!year.quarters[q].length && <p className="quarter-empty">Room for your next step</p>}<button className="add-to-quarter" onClick={() => { setSlot(`${yi}:${q}`); setNotice(`Select a course, then use “Add to quarter” for ${q} ${year.label}.`) }}>+ Add a course</button></div>)}</div></section>)}<button className="secondary" onClick={store.addYear}>+ Add an academic year</button></div>}
          {view === 'requirements' && <RequirementsView blocks={requirements.blocks} programs={programs} courses={courses} onSelect={setSelected} />}
        </section>
        <aside className="detail-panel" aria-label="Course details">{course ? <><div className="detail-kicker">COURSE SPOTLIGHT<span className={`status-pill ${state}`}>{labels[state]}</span></div><div className={`detail-icon ${state}`}><Icon name={state === 'completed' ? 'check' : 'book'} size={25} /></div><h2>{shortCode(selectedId)}</h2><h3>{course.title}</h3><div className="detail-meta"><span>{course.units[0] ?? '?'}{course.units[1] !== course.units[0] ? `–${course.units[1]}` : ''} units</span><span>{core.includes(selectedId) ? 'On your path' : 'Explore course'}</span></div><p className="course-description">{course.description}</p><div className="detail-section"><h4>BEFORE YOU TAKE THIS</h4><p>{describe(course.prereq) || course.prereq_text || 'No course prerequisites. Start here.'}</p>{course.prereq_text && <details><summary>Grades & prerequisite details</summary><p>{course.prereq_text}</p></details>}</div><div className="detail-section"><h4>OPENS THE DOOR TO <span>{directNext.length}</span></h4><div className="next-courses">{directNext.slice(0, 6).map((id) => <button key={id} onClick={() => setSelected(id)}>{shortCode(id)}<Icon name="arrow" size={13} /></button>)}{!directNext.length && <p>No further dependencies in the catalogue.</p>}{directNext.length > 6 && <small>+ {directNext.length - 6} more dependent courses</small>}</div>{state !== 'completed' && nextUnlocked.length > 0 && <p className="unlock-note">Complete this to unlock {nextUnlocked.length} course{nextUnlocked.length > 1 ? 's' : ''} with your current credits.</p>}</div><button className={state === 'completed' ? 'secondary full' : 'primary full'} onClick={() => { store.toggleCompleted(selectedId); setNotice(state === 'completed' ? `${shortCode(selectedId)} removed from completed courses.` : `${shortCode(selectedId)} completed. Your roadmap has updated.`) }}><Icon name="check" size={16} />{state === 'completed' ? 'Undo completed course' : 'Mark as completed'}</button><p className="credit-note">Mark complete only when prerequisite grade requirements are met.</p><button className="text-button full" onClick={() => store.toggleExtra(selectedId)} disabled={requirements.required.includes(selectedId)}>{requirements.required.includes(selectedId) ? 'Included in suggested core' : store.extraCourses.includes(selectedId) ? '− Remove from my path' : '+ Include in my path'}</button><div className="manual-plan"><label htmlFor="quarter-slot">Add to quarter</label><div><select id="quarter-slot" value={slot} onChange={(e) => setSlot(e.target.value)}>{store.years.flatMap((y, yi) => QUARTERS.map((q) => <option key={`${yi}:${q}`} value={`${yi}:${q}`}>{q} · {y.label}</option>))}</select><button aria-label="Add selected course to quarter" disabled={completed.has(selectedId) || planned.has(selectedId)} onClick={() => { const [yi, q] = slot.split(':'); store.addCourse(Number(yi), q as typeof QUARTERS[number], selectedId); setNotice(`${shortCode(selectedId)} added to your plan.`) }}>+</button></div>{selectedPlanned.length > 0 && <small>Planned: {selectedPlanned.join(', ')}</small>}</div><details className="enrollment-details"><summary>Enrollment & recent offerings</summary><p>{course.restriction || 'Check the catalogue for enrollment restrictions.'}</p>{seasonStats && lastOffered ? <><div className="season-stats">{QUARTERS.map((q) => <span key={q} className={seasonStats[q].offered === 0 ? 'none' : seasonStats[q].offered / seasonStats[q].observed >= 0.75 && seasonStats[q].recent ? 'often' : 'some'}><strong>{q}</strong>{seasonStats[q].observed ? `${seasonStats[q].offered}/${seasonStats[q].observed} yrs` : 'no data'}</span>)}</div><p>Last offered: {lastOffered}. Future quarters are predicted from schedules since 2021 (or since the course first appeared).</p></> : <p>Not offered since 2021 — check with the department before planning it.</p>}<p>Unlocked reflects course prerequisites. Placement, grades, restrictions and future availability still apply.</p></details></> : <div className="empty-state">Select a course to explore its prerequisites and next steps.</div>}</aside>
      </div>
      <div className="bottom-note"><Icon name="tree" size={16} /><span>A course is a stepping stone. Complete it and watch your path open up.</span><span>Connections include AND / OR alternatives. Select a course for exact rules.</span></div>
    </main>
    {notice && <div className="toast" role="status">{notice}<button aria-label="Dismiss notification" onClick={() => setNotice('')}>×</button></div>}
    {showGenerator && <div className="modal-backdrop" onClick={() => setShowGenerator(false)}><section className="generator-modal" role="dialog" aria-modal="true" aria-labelledby="generator-title" onClick={(e) => e.stopPropagation()}><button className="modal-close" aria-label="Close plan builder" onClick={() => setShowGenerator(false)}><Icon name="close" /></button><div className="eyebrow">LET’S CONNECT THE DOTS</div><h2 id="generator-title">Make room for your future.</h2><p>Build a prerequisite-aware draft for {programs.map((p) => p.name).join(' + ')} using your {completed.size} completed courses.</p><div className="generator-fields"><label>Starting academic year<input type="number" min="2020" max="2100" value={options.startYear} onChange={(e) => { setOptions({ ...options, startYear: Number(e.target.value) }); setPreview(null) }} /></label><label>Starting quarter<select value={options.startQuarter} onChange={(e) => { setOptions({ ...options, startQuarter: e.target.value as PlanOptions['startQuarter'] }); setPreview(null) }}><option>Fall</option><option>Winter</option><option>Spring</option></select></label><label>Quarters until graduation<input type="number" min="1" max="24" value={options.quarters} onChange={(e) => { setOptions({ ...options, quarters: Number(e.target.value) }); setPreview(null) }} /></label><label>Maximum units / quarter<input type="number" min="4" max="24" value={options.maxUnits} onChange={(e) => { setOptions({ ...options, maxUnits: Number(e.target.value) }); setPreview(null) }} /></label></div><label className="checkbox-label"><input type="checkbox" checked={options.summer} onChange={(e) => { setOptions({ ...options, summer: e.target.checked }); setPreview(null) }} />Include summer quarters</label><div className="plan-advisory"><p>This draft schedules suggested core courses, selected electives and their prerequisites. Review GE, elective counts, minimum units, residency and double-counting rules before treating it as a graduation plan. Placement / exam conditions remain flagged.</p></div>{preview && <div className="preview-result"><h3>{preview.years.flatMap((y) => Object.values(y.quarters).flat()).length} courses scheduled · {preview.remaining.length} unresolved</h3>{preview.remaining.length > 0 && <p>Needs another quarter or prerequisite review: {preview.remaining.join(', ')}</p>}{preview.conditional.length > 0 && <p>Conditional eligibility: {preview.conditional.join(', ')}</p>}<p>Review elective and GE choices in Degree requirements. Future course offerings have not been confirmed.</p><button className="primary full" onClick={() => { store.setYears(preview.years); if (!store.programIds.length) store.setPrograms(ids); setShowGenerator(false); setNotice('Plan saved. Open Quarter planner to review each term.') }}>Use this draft · replace current schedule</button></div>}<button className="secondary full" disabled={options.quarters < 1 || options.quarters > 24 || !Number.isInteger(options.quarters) || options.maxUnits < 4 || options.maxUnits > 24 || options.startYear < 2020 || options.startYear > 2100 || !Number.isInteger(options.startYear)} onClick={() => setPreview(generatePlan(targets, completed, courses, options, offeredIn))}><Icon name="sparkle" size={16} />{preview ? 'Rebuild draft' : 'Preview my plan'}</button></section></div>}
  </>
}
