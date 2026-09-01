import type { Config } from 'tailwindcss'

export default {
  darkMode: ['class', 'class'],
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
		fontFamily: {
			heading: [
				'var(--font-heading)',
				'sans-serif'
			],
			body: [
				'var(--font-body)',
				'sans-serif'
			],
			'session-display': [
				'"Avenir Next Condensed"',
				'"Arial Narrow"',
				'var(--font-heading)',
				'sans-serif'
			],
			'session-heading': [
				'"Avenir Next Condensed"',
				'"Arial Narrow"',
				'var(--font-heading)',
				'sans-serif'
			],
			'session-label': [
				'"Avenir Next Condensed"',
				'"Arial Narrow"',
				'var(--font-heading)',
				'sans-serif'
			]
		},
		fontSize: {
			/*
			 * Calibrated web equivalents of the native SwiftUI type scale.
			 * The source values are iOS points; the web values below were
			 * measured against same-device native and Safari screenshots.
			 */
			'ios-display-46': '43px',
			'ios-display-40': '37px',
			'ios-display-34': '32px',
			'ios-display-30': '28px',
			'ios-display-25': '23px',
			'ios-display-24': '22px',
			'ios-display-23': '21px',
			'ios-display-20': '19px',
			'ios-display-19': '18px',
			'ios-display-18': '17px',
			'ios-body': '16px',
			'ios-subheadline': '14px',
			'ios-footnote': '12px',
			'ios-caption': '11px',
			'ios-caption2': '10px',
			'ios-label-15': '14px',
			'ios-label-13': '12px',
			'ios-label-12': '11px',
			'ios-label-11': '10px',
			'ios-label-10': '9px',
			'ios-label-9': '8.5px',
		},
  		colors: {
			'ds-surface-raised': 'rgb(var(--ds-surface-raised) / <alpha-value>)',
			'ds-surface-selected': 'rgb(var(--ds-surface-selected) / <alpha-value>)',
			'ds-content-on-selected': 'rgb(var(--ds-content-on-selected) / <alpha-value>)',
			'ds-section-accent': 'rgb(var(--ds-section-accent) / <alpha-value>)',
			'ds-control-selected': 'rgb(var(--ds-control-selected) / <alpha-value>)',
			'ds-control-selected-hover': 'rgb(var(--ds-control-selected-hover) / <alpha-value>)',
			'ds-button-primary': 'rgb(var(--ds-button-primary) / <alpha-value>)',
			'ds-button-primary-foreground': 'rgb(var(--ds-button-primary-foreground) / <alpha-value>)',
			'ds-button-accent': 'rgb(var(--ds-button-accent) / <alpha-value>)',
			'ds-button-accent-bright': 'rgb(var(--ds-button-accent-bright) / <alpha-value>)',
			'ds-button-surface': 'rgb(var(--ds-button-surface) / <alpha-value>)',
			'ds-button-surface-hover': 'rgb(var(--ds-button-surface-hover) / <alpha-value>)',
			'ds-button-foreground': 'rgb(var(--ds-button-foreground) / <alpha-value>)',
			'ds-button-muted': 'rgb(var(--ds-button-muted) / <alpha-value>)',
			'ds-button-destructive': 'rgb(var(--ds-button-destructive) / <alpha-value>)',
			'ds-button-hairline': 'rgb(var(--ds-button-hairline) / <alpha-value>)',
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
			control: 'var(--ds-radius-control)',
			card: 'var(--ds-radius-card)',
			panel: 'var(--ds-radius-panel)',
			sheet: 'var(--ds-radius-sheet)',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
		},
		boxShadow: {
			'ds-control': 'var(--ds-shadow-control)',
			'ds-selection': 'var(--ds-shadow-selection)',
			'ds-primary-action': 'var(--ds-shadow-primary-action)',
		},
		transitionDuration: {
			press: 'var(--ds-duration-press)',
		},
		transitionTimingFunction: {
			'ds-out': 'var(--ds-ease-out)',
		}
  	}
  },
  plugins: [require('tailwindcss-animate')],
} satisfies Config
