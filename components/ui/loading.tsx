'use client'

import { Stack } from './stack'
import { Icon } from './icon'
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
	if (inline) {
		return (
			<Stack
				direction="column"
				alignItems="center"
				justifyContent="center"
				spacing={2}
				className={className}
			>
				<Icon
					icon="solar:refresh-bold"
					className="size-6 animate-spin text-muted-foreground"
				/>
				{label && (
					<p className="text-sm text-muted-foreground">{label}</p>
				)}
			</Stack>
		)
	}

	return (
		<Stack
			direction="column"
			alignItems="center"
			justifyContent="center"
			spacing={2}
			className={cn('min-h-[60vh]', className)}
		>
			<Icon
				icon="solar:refresh-bold"
				className="size-8 animate-spin text-muted-foreground"
			/>
			{label && (
				<p className="text-muted-foreground">{label}</p>
			)}
		</Stack>
	)
}

