# Gweilo web design system

The web design system is a compatibility-first layer. Its first job is to make
the current interface easier to change without silently redesigning existing
screens.

## Component layers

1. `components/vendor/shadcn` contains third-party primitives. Product code
   must not import this directory directly.
2. `components/ui` is the stable app boundary. It contains app-owned
   components and thin wrappers around vendor primitives.
3. Feature folders compose UI components into domain patterns such as session
   cards, activity timelines, and statistics panels.
4. Route files assemble features and own page data and navigation.

ESLint enforces the vendor boundary. When a vendor primitive is needed, add a
wrapper in `components/ui` first, even if the initial wrapper only re-exports
the primitive.

## Tokens

Global semantic tokens live in `app/globals.css` and are exposed to Tailwind in
`tailwind.config.ts`.

- Existing shadcn variables (`background`, `card`, `primary`, and related
  tokens) are the compatibility palette.
- `ds-*` tokens describe product roles such as raised surfaces, selected
  controls, card radii, and shared shadows.
- Components should use semantic role names rather than hex values or names
  tied to a single page.

Changing a token is intentionally powerful. Check the Design System catalogue
and all affected product screens before merging a token change.

## Adding or changing a component

1. Start with the closest component in `components/ui`.
2. Add a named variant instead of repeating a long `className` override in a
   route.
3. Preserve accessible labels, keyboard focus, disabled states, and reduced
   motion behavior.
4. Add the new variant and relevant states to `/admin/design-system`.
5. Verify at mobile and desktop widths before changing consumers.

## Living catalogue

Admins can open `/admin/design-system` to review the actual production
components, their supported states, tokens, and ownership. It is a reference
surface, not a duplicate implementation or a static mockup.
