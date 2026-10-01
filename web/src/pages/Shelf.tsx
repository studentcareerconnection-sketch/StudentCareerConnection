import { CompleteShelfLandingPage } from '../shelf/CompleteShelfLandingPage'
import { useShelfBridge } from '../shelf/useShelfBridge'

/** Full-screen major shelf: every UCI major, with Undecided in the middle. */
export default function Shelf() {
  const applyScene = useShelfBridge()
  return (
    <div className="shader-frame">
      <CompleteShelfLandingPage
        headingFont="iowan-old-style"
        bodyFont="inter"
        headingWeight="400"
        bodyWeight="400"
        primaryColor="#c87046"
        headingSize={60}
        bodySize={12}
        headingLetterSpacing={-0.055}
        applyScene={applyScene}
      />
    </div>
  )
}
