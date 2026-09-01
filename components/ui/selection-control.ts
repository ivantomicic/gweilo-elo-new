import { cva } from "class-variance-authority";

/**
 * Canonical visual foundation for single-selection controls.
 *
 * Semantics stay in the owning wrapper: SegmentedControl exposes a radio
 * group, while Tabs keeps Radix's tablist/tab/tabpanel contract. Both use the
 * same iOS-derived capsule, state colors, focus treatment, and press feedback.
 */
export const selectionControlListStyles = cva(
	"isolate grid w-full max-w-full grid-flow-col auto-cols-fr items-stretch gap-1 rounded-control border border-ds-button-hairline/[0.13] bg-ds-surface-raised p-1",
);

export const selectionControlItemStyles = cva(
	"touch-safe inline-flex min-h-11 min-w-0 items-center justify-center whitespace-normal rounded-control px-3 py-2 text-center text-sm font-bold leading-tight text-ds-button-foreground outline-none transition-[transform,opacity,background-color,color,box-shadow] duration-press ease-ds-out hover:bg-ds-button-hairline/[0.06] active:scale-[0.97] active:opacity-[0.82] focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ds-section-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:text-ds-button-muted disabled:opacity-40 data-[disabled]:pointer-events-none data-[disabled]:text-ds-button-muted data-[disabled]:opacity-40 data-[state=active]:bg-ds-control-selected data-[state=active]:text-ds-content-on-selected data-[state=active]:shadow-ds-selection data-[state=active]:hover:bg-ds-control-selected-hover data-[state=on]:bg-ds-control-selected data-[state=on]:text-ds-content-on-selected data-[state=on]:shadow-ds-selection data-[state=on]:hover:bg-ds-control-selected-hover motion-reduce:transition-[opacity,background-color,color,box-shadow] motion-reduce:active:scale-100",
);
