import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const mergeTailwindClasses = extendTailwindMerge({
  extend: {
    theme: {
      // These are semantic font-size tokens, not custom text colors. Teaching
      // tailwind-merge the namespace prevents a following `text-ds-*` color
      // class from silently deleting the iOS type size.
      text: [(value: string) => value.startsWith('ios-')],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return mergeTailwindClasses(clsx(inputs))
}
