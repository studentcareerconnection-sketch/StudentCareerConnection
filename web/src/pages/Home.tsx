import { LandingPageFrame } from '../shelf/LandingPageFrame'
import { useShelfBridge } from '../shelf/useShelfBridge'
import '../shelf/threeui.css'

/** The student's own bookcase: a Progress volume plus every program they have chosen. */
export default function Home() {
  const applyScene = useShelfBridge()
  return (
    <div className="shader-frame">
      <LandingPageFrame
        title="My shelf — UCI Planner"
        sourceUrl={`${import.meta.env.BASE_URL}landing-pages/home-shelf.html`}
        applyScene={applyScene}
      />
    </div>
  )
}
