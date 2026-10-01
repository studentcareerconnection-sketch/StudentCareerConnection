// Typography/colour overrides for a landing page loaded in LandingPageFrame.
// ThreeUI's own pageTypography module was not part of the source bundle, so this is a
// small local equivalent covering the props CompleteShelfLandingPage is configured with.

export type PageTypographyProps = {
  headingFont?: string
  bodyFont?: string
  headingWeight?: string
  bodyWeight?: string
  primaryColor?: string
  headingSize?: number
  bodySize?: number
  headingLetterSpacing?: number
}

export type LandingPageCustomization = Required<PageTypographyProps>

const FONT_STACKS: Record<string, string> = {
  'iowan-old-style': '"Iowan Old Style", "Baskerville", "Times New Roman", serif',
  inter: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif',
}

// The values Working Volumes was authored with.
export const COMPLETE_SHELF_TYPOGRAPHY: LandingPageCustomization = {
  headingFont: 'iowan-old-style',
  bodyFont: 'inter',
  headingWeight: '400',
  bodyWeight: '400',
  primaryColor: '#c87046',
  headingSize: 60,
  bodySize: 12,
  headingLetterSpacing: -0.055,
}

const TYPOGRAPHY_KEYS = Object.keys(COMPLETE_SHELF_TYPOGRAPHY) as (keyof PageTypographyProps)[]

export function splitTypographyProps<T extends PageTypographyProps>(props: T): [PageTypographyProps, Omit<T, keyof PageTypographyProps>] {
  const type: PageTypographyProps = {}
  const rest: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if ((TYPOGRAPHY_KEYS as string[]).includes(key)) (type as Record<string, unknown>)[key] = value
    else rest[key] = value
  }
  return [type, rest as Omit<T, keyof PageTypographyProps>]
}

export function resolveTypography(base: LandingPageCustomization, type: PageTypographyProps): LandingPageCustomization {
  const merged = { ...base }
  for (const key of TYPOGRAPHY_KEYS) {
    const value = type[key]
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value
  }
  return merged
}

const STYLE_ID = 'threeui-page-customization'
const fontStack = (font: string) => FONT_STACKS[font] ?? `"${font.replace(/"/g, '')}", serif`
const rem = (px: number) => `${(px / 16).toFixed(4)}rem`

function customizationCss(c: LandingPageCustomization) {
  return `
    :root { --serif: ${fontStack(c.headingFont)}; --mono: ${fontStack(c.bodyFont)}; --primary: ${c.primaryColor}; }
    body { font-weight: ${c.bodyWeight}; }
    .selection__title { font-size: clamp(2rem, 3.4vw, ${rem(c.headingSize)}); font-weight: ${c.headingWeight}; letter-spacing: ${c.headingLetterSpacing}em; }
    .detail-title, .editorial-identity strong { font-weight: ${c.headingWeight}; }
    .selection__note { font-size: ${rem(c.bodySize)}; }
  `
}

/** Appends the overrides to the frame's own head; the packaged file is never rewritten. */
export function applyPageCustomization(frame: HTMLIFrameElement | null, customization?: LandingPageCustomization) {
  let document: Document | null | undefined
  try {
    document = frame?.contentDocument
  } catch {
    return // cross-origin frame: postPageCustomization covers it
  }
  if (!document?.head) return
  document.getElementById(STYLE_ID)?.remove()
  if (!customization) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = customizationCss(customization)
  document.head.appendChild(style)
}

export function postPageCustomization(frame: HTMLIFrameElement | null, customization?: LandingPageCustomization) {
  if (!customization) return
  frame?.contentWindow?.postMessage({ type: 'threeui-page-customization', customization }, location.origin)
}
