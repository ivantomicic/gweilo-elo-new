'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
	direction?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
	spacing?: number | string
	alignItems?: 'start' | 'center' | 'end' | 'stretch' | 'baseline'
	justifyContent?: 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly'
	flexWrap?: boolean
}

const Stack = React.forwardRef<HTMLDivElement, StackProps>(
	(
		{
			className,
			direction = 'column',
			spacing = 0,
			alignItems,
			justifyContent,
			flexWrap,
			style,
			...props
		},
		ref
	) => {
		const spacingValue =
			typeof spacing === 'number' ? `${spacing * 0.25}rem` : spacing

		return (
			<div
				ref={ref}
				className={cn(
					'flex',
					direction === 'row' && 'flex-row',
					direction === 'column' && 'flex-col',
					direction === 'row-reverse' && 'flex-row-reverse',
					direction === 'column-reverse' && 'flex-col-reverse',
					flexWrap && 'flex-wrap',
					alignItems === 'start' && 'items-start',
					alignItems === 'center' && 'items-center',
					alignItems === 'end' && 'items-end',
					alignItems === 'stretch' && 'items-stretch',
					alignItems === 'baseline' && 'items-baseline',
					justifyContent === 'start' && 'justify-start',
					justifyContent === 'center' && 'justify-center',
					justifyContent === 'end' && 'justify-end',
					justifyContent === 'between' && 'justify-between',
					justifyContent === 'around' && 'justify-around',
					justifyContent === 'evenly' && 'justify-evenly',
					className
				)}
				style={{
					gap: spacingValue,
					...style,
				}}
				{...props}
			/>
		)
	}
)
Stack.displayName = 'Stack'

export { Stack }

