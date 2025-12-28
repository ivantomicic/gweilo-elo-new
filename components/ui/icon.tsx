'use client'

import dynamic from 'next/dynamic'
import type { IconProps } from '@iconify/react'

// Dynamically import Iconify with SSR disabled to avoid module resolution issues
const IconifyIcon = dynamic(
  () => import('@iconify/react').then((mod) => mod.Icon),
  {
    ssr: false,
    loading: () => <div className="size-5" />, // Placeholder during load
  }
)

// Wrapper component for Iconify icons
export function Icon({ icon, ...props }: IconProps) {
  return <IconifyIcon icon={icon} {...props} />
}

