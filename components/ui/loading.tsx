'use client'

import { StateBlock } from './state-block'
import { cn } from '@/lib/utils'

export interface LoadingProps {
	/**
	 * Optional label text to display below the loader
	 */
	label?: string
	/**
	 * If true, renders inline (does not take full screen)
	 * If false (default), centers loader and label on screen
	 */
	inline?: boolean
	/**
	 * Additional className for the container
	 */
	className?: string
}

/**
 * Loading component with spinner and optional label
 * 
 * Default: Centers loader on screen with min-height
 * Inline: Renders inline without full-screen centering
 */
export function Loading({ label, inline = false, className }: LoadingProps) {
	return (
		<StateBlock
			variant="loading"
			size={inline ? "sm" : "lg"}
			title={label}
			className={cn(
				inline ? "min-h-0 px-0 py-0" : "min-h-[60vh]",
				className
			)}
		/>
	)
}
