// Renders requirement progress (from lib/requirements.ts) as an expandable checklist.
import { useState } from 'react'
import type { CourseMap, Program } from '../types'
import { blockTotals, markerKey, type BlockProgress, type NodeProgress, type PickSource } from '../lib/requirements'
import { usePlanner } from '../store'

const SOURCE_LABEL: Record<PickSource, string> = { completed: 'Completed', chosen: 'Your pick', planned: 'In plan', suggested: 'Suggested' }
const shortCode = (s: string) => s.replace('I&C SCI', 'ICS').replace('COMPSCI', 'CS')

interface Props {
  blocks: BlockProgress[]
  programs: Program[]
  courses: CourseMap
  onSelect: (courseId: string) => void
}

/** Degree progress per requirement, with the student's picks and our suggestions. */
export default function RequirementsView({ blocks, programs, courses, onSelect }: Props) {
  const programOf = (key: string) => programs.find((p) => p.id === key.split(':')[0])
  return <div className="requirements-content">
    <div className="plan-advisory"><p>Requirements come from UCI DegreeWorks via Anteater API. Courses you completed, picked or planned count first; we suggest the rest. Course completion here doesn’t certify graduation — confirm with your advisor or DegreeWorks.</p></div>
    {blocks.map((block) => {
      const program = programOf(block.key)
      const totals = blockTotals(block)
      const isProgram = program && !block.key.includes(':')
      return <section key={block.key} className="req-block">
        <div className="requirements-title">
          <div>
            <h2>{block.name}</h2>
            <small className="req-meta">
              {totals.done} / {totals.need} requirements complete
              {isProgram && program.catalogYear && <> · {program.catalogYear.slice(0, 4)}–{program.catalogYear.slice(6)} catalog</>}
              {isProgram && program.source === 'catalogue' && <> · parsed from catalogue text, review carefully</>}
            </small>
          </div>
          {isProgram && program.url && <a href={program.url} target="_blank" rel="noreferrer">UCI catalogue ↗</a>}
        </div>
        <div className="mini-progress wide"><i style={{ width: `${totals.need ? (totals.done / totals.need) * 100 : 0}%` }} /></div>
        {block.nodes.map((n) => <Requirement key={n.node.id} progress={n} courses={courses} onSelect={onSelect} depth={0} />)}
      </section>
    })}
  </div>
}

function Requirement({ progress, courses, onSelect, depth }: { progress: NodeProgress; courses: CourseMap; onSelect: (id: string) => void; depth: number }) {
  const { node } = progress
  const store = usePlanner()
  const [open, setOpen] = useState(false)
  const status = progress.complete ? 'done' : progress.committed >= progress.need ? 'planned' : 'open'
  const statusText = progress.complete ? 'Complete'
    : node.type === 'group' ? `${progress.done} of ${progress.need} done`
      : node.type === 'units' ? `${progress.done} / ${progress.need} units`
        : node.type === 'course' ? `${progress.done} / ${progress.need} courses` : 'Not marked'

  if (node.type === 'marker') {
    return <div className={`req-node ${status}`} style={{ marginLeft: depth * 16 }}>
      <label className="req-marker">
        <input type="checkbox" checked={progress.complete} onChange={() => store.toggleCompleted(markerKey(node.id))} />
        <span>{node.label}</span>
      </label>
      <span className={`req-status ${status}`}>{progress.complete ? 'Complete' : 'Check off when met'}</span>
    </div>
  }

  if (node.type === 'group') {
    const alternatives = progress.children!.filter((c) => !c.selected)
    return <div className={`req-node group ${status} ${progress.selected ? '' : 'unused'}`} style={{ marginLeft: depth * 16 }}>
      <div className="req-head">
        <strong>{node.label}</strong>
        {node.count < node.children.length && <small>Choose {node.count} of {node.children.length}</small>}
        <span className={`req-status ${status}`}>{statusText}</span>
      </div>
      {progress.children!.filter((c) => c.selected).map((c) => <Requirement key={c.node.id} progress={c} courses={courses} onSelect={onSelect} depth={depth + 1} />)}
      {alternatives.length > 0 && <button className="req-toggle" style={{ marginLeft: (depth + 1) * 16 }} onClick={() => setOpen(!open)}>
        {open ? 'Hide' : 'Show'} {alternatives.length} other option{alternatives.length > 1 ? 's' : ''}
      </button>}
      {open && alternatives.map((c) => <Requirement key={c.node.id} progress={c} courses={courses} onSelect={onSelect} depth={depth + 1} />)}
    </div>
  }

  // course / units
  const options = node.courses.filter((id) => !progress.picks.includes(id))
  const pickAll = node.courses.length <= node.count && node.type === 'course'
  return <div className={`req-node ${status} ${progress.selected ? '' : 'unused'}`} style={{ marginLeft: depth * 16 }}>
    <div className="req-head">
      <strong>{node.label}</strong>
      {!pickAll && <small>{node.type === 'units' ? `${node.count} units from ${node.courses.length} courses` : `Choose ${node.count} of ${node.courses.length}`}</small>}
      {progress.selected && <span className={`req-status ${status}`}>{statusText}</span>}
    </div>
    {progress.selected && <div className="req-courses">
      {progress.picks.map((id) => <CourseChip key={id} id={id} source={progress.sources[id]} courses={courses} onSelect={onSelect} />)}
      {!progress.picks.length && <small className="req-empty">Nothing picked yet</small>}
    </div>}
    {!pickAll && options.length > 0 && <>
      <button className="req-toggle" onClick={() => setOpen(!open)}>{open ? 'Hide options' : `Pick from ${options.length} more`}</button>
      {open && <div className="req-courses options">
        {options.map((id) => <CourseChip key={id} id={id} courses={courses} onSelect={onSelect} />)}
      </div>}
    </>}
  </div>
}

function CourseChip({ id, source, courses, onSelect }: { id: string; source?: PickSource; courses: CourseMap; onSelect: (id: string) => void }) {
  const store = usePlanner()
  const known = !!courses[id]
  const chosen = store.extraCourses.includes(id)
  return <span className={`req-chip ${source ?? 'option'} ${known ? '' : 'retired'}`} title={known ? `${courses[id].title}${source ? ` · ${SOURCE_LABEL[source]}` : ''}` : 'Not in the current catalogue'}>
    <button className="req-chip-name" onClick={() => known && onSelect(id)} disabled={!known}>
      {source === 'completed' && '✓ '}{shortCode(id)}
    </button>
    {known && source !== 'completed' && <button className="req-chip-pick" onClick={() => store.toggleExtra(id)}
      aria-label={chosen ? `Remove ${id} from your picks` : `Pick ${id}`} title={chosen ? 'Remove from your picks' : 'Pick this course'}>
      {chosen ? '★' : source === 'suggested' ? '☆' : '+'}
    </button>}
  </span>
}
