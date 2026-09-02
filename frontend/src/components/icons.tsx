/**
 * Inline SVG icon set. No emoji, no icon-font dependency.
 * All icons share a 24-unit grid, 1.6 stroke, and inherit currentColor.
 */
import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number; title?: string }

function Icon({ size = 15, title, children, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  )
}

export const IconGauge = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    <path d="m13.4 10.6 4.2-4.2" />
    <path d="M3.3 17A9 9 0 1 1 20.7 17" />
  </Icon>
)

export const IconIncident = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </Icon>
)

export const IconMap = (p: IconProps) => (
  <Icon {...p}>
    <rect x="9" y="2" width="6" height="5" rx="1" />
    <rect x="2" y="17" width="6" height="5" rx="1" />
    <rect x="16" y="17" width="6" height="5" rx="1" />
    <path d="M12 7v4" />
    <path d="M5 17v-3h14v3" />
  </Icon>
)

export const IconBook = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
    <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2Z" />
    <path d="M9 7h7" />
    <path d="M9 11h5" />
  </Icon>
)

export const IconFlask = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2v6.5L4.6 18a2 2 0 0 0 1.7 3h11.4a2 2 0 0 0 1.7-3L14 8.5V2" />
    <path d="M8.5 2h7" />
    <path d="M6.8 14h10.4" />
  </Icon>
)

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Icon>
)

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6 18 18" />
    <path d="M18 6 6 18" />
  </Icon>
)

export const IconArrowLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="m11 18-6-6 6-6" />
  </Icon>
)

export const IconClock = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
)

export const IconCommit = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M2 12h6.5" />
    <path d="M15.5 12H22" />
  </Icon>
)

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 22s8-4 8-10V5.5L12 2.5 4 5.5V12c0 6 8 10 8 10Z" />
    <path d="m9 12 2 2 4-4" />
  </Icon>
)

export const IconDatabase = (p: IconProps) => (
  <Icon {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3.5" />
    <path d="M4 5.5v13c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-13" />
    <path d="M4 12c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5" />
  </Icon>
)

export const IconServer = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="3" width="19" height="7" rx="1.5" />
    <rect x="2.5" y="14" width="19" height="7" rx="1.5" />
    <path d="M6.5 6.5h.01" />
    <path d="M6.5 17.5h.01" />
  </Icon>
)

export const IconGlobe = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18" />
    <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
  </Icon>
)

export const IconDoc = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h5" />
    <path d="M9 13h6" />
    <path d="M9 17h4" />
  </Icon>
)

export const IconPlay = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 3.5 20 12 6 20.5Z" />
  </Icon>
)

export const IconRotate = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
    <path d="M3 3v5h5" />
  </Icon>
)

export const IconLink = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
    <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
  </Icon>
)

/** Tier glyphs for the service tables and the map. */
export function TierIcon({ tier, ...rest }: { tier: string } & IconProps) {
  if (tier === 'datastore') return <IconDatabase {...rest} />
  if (tier === 'edge') return <IconGlobe {...rest} />
  return <IconServer {...rest} />
}
