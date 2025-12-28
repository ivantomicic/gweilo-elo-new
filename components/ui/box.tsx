'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

export interface BoxProps extends React.HTMLAttributes<HTMLDivElement> {
	component?: keyof JSX.IntrinsicElements
}

const Box = React.forwardRef<HTMLDivElement, BoxProps>(
	({ className, component = 'div', ...props }, ref) => {
		const Component = component as any

		return <Component ref={ref} className={cn(className)} {...props} />
	}
)
Box.displayName = 'Box'

export { Box }

