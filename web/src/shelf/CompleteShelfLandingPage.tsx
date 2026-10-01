// CompleteShelfLandingPage from ThreeUI LandingPages.tsx, pointed at the UCI major shelf
// (public/landing-pages/major-shelf.html) instead of the seven-volume Working Volumes page.
import { useMemo } from 'react'
import { LandingPageFrame, type LandingPageProps } from './LandingPageFrame'
import {
  COMPLETE_SHELF_TYPOGRAPHY,
  resolveTypography,
  splitTypographyProps,
  type PageTypographyProps,
} from './pageTypography'
import './threeui.css'

export function CompleteShelfLandingPage(props: LandingPageProps & PageTypographyProps) {
  const [type, frame] = splitTypographyProps(props)
  const key = JSON.stringify(type)
  const customization = useMemo(() => resolveTypography(COMPLETE_SHELF_TYPOGRAPHY, JSON.parse(key)), [key])
  return <LandingPageFrame
    {...frame}
    customization={customization}
    title="Major Shelf — every UCI major, A to Z"
    sourceUrl={`${import.meta.env.BASE_URL}landing-pages/major-shelf.html`}
  />
}
