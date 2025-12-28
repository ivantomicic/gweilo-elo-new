'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Input as BaseInput } from '@/components/vendor/shadcn/input'
import { Icon } from '@/components/ui/icon'

export interface InputProps extends React.ComponentProps<'input'> {
	label?: string
	labelAction?: React.ReactNode
	icon?: string
	rightAction?: React.ReactNode
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
	({ className, label, labelAction, icon, rightAction, ...props }, ref) => {
		const hasIcon = !!icon
		const hasRightAction = !!rightAction

		const inputElement = (
			<div className="relative">
				{hasIcon && (
					<div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
						<Icon
							icon={icon!}
							className="size-5 text-muted-foreground"
						/>
					</div>
				)}
				<BaseInput
					ref={ref}
					className={cn(
						hasIcon && 'pl-12',
						hasRightAction && 'pr-12',
						className
					)}
					{...props}
				/>
				{hasRightAction && (
					<div className="absolute inset-y-0 right-0 pr-4 flex items-center">
						{rightAction}
					</div>
				)}
			</div>
		)

		if (label || labelAction) {
			return (
				<div className="space-y-1.5">
					{labelAction ? (
						<div className="flex justify-between items-center ml-1">
							{label && (
								<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
									{label}
								</label>
							)}
							{labelAction}
						</div>
					) : (
						label && (
							<label className="text-xs font-bold uppercase tracking-widest text-muted-foreground ml-1">
								{label}
							</label>
						)
					)}
					{inputElement}
				</div>
			)
		}

		return inputElement
	}
)
Input.displayName = 'Input'

export { Input }

