import { useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlanner } from '../store'

// Routes a shelf page may send the student to.
const DESTINATIONS = new Set(['/', '/shelf', '/roadmap', '/plan', '/requirements', '/setup'])

type PlannerSlice = Pick<ReturnType<typeof usePlanner.getState>, 'programIds' | 'completed' | 'years'>

const stateMessage = ({ programIds, completed, years }: PlannerSlice) => ({
  type: 'uci-shelf:state',
  programIds,
  completed,
  plannedCourses: years.flatMap((y) => Object.values(y.quarters).flat()),
})

/**
 * The shelves run in same-origin iframes and talk to the planner store over
 * postMessage, so the store stays the single source of truth. Returns the
 * LandingPageFrame `applyScene` callback, which pushes fresh state on load and
 * whenever the student's programs or courses change.
 */
export function useShelfBridge() {
  const programIds = usePlanner((s) => s.programIds)
  const completed = usePlanner((s) => s.completed)
  const years = usePlanner((s) => s.years)
  const setPrograms = usePlanner((s) => s.setPrograms)
  const navigate = useNavigate()

  const applyScene = useCallback((frame: HTMLIFrameElement) => {
    frame.contentWindow?.postMessage(stateMessage({ programIds, completed, years }), location.origin)
  }, [programIds, completed, years])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== location.origin) return
      const data = event.data as { type?: string; programIds?: unknown; to?: unknown } | null
      if (data?.type === 'uci-shelf:ready') {
        (event.source as Window | null)?.postMessage(stateMessage(usePlanner.getState()), location.origin)
      } else if (data?.type === 'uci-shelf:set-programs' && Array.isArray(data.programIds)) {
        setPrograms(data.programIds.filter((id): id is string => typeof id === 'string'))
      } else if (data?.type === 'uci-shelf:navigate' && typeof data.to === 'string' && DESTINATIONS.has(data.to)) {
        navigate(data.to)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [navigate, setPrograms])

  return applyScene
}
