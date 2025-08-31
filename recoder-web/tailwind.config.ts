import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";
import defaultTheme from "tailwindcss/defaultTheme";
import typography from "@tailwindcss/typography";
import animate from "tailwindcss-animate";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
    "./styles/**/*.{css}",
  ],
  theme: {
    extend: {
      // Enhanced Font System
      fontFamily: {
        sans: ['Inter', '"Aeonik"', ...defaultTheme.fontFamily.sans],
        serif: ['Crimson Text', ...defaultTheme.fontFamily.serif],
        mono: ['JetBrains Mono', '"Aeonik Mono"', ...defaultTheme.fontFamily.mono],
        display: ['Lexend', 'Inter', ...defaultTheme.fontFamily.sans],
      },

      // Enhanced Font Sizes with Fluid Typography
      fontSize: {
        'xs': ['clamp(0.75rem, 0.7rem + 0.2vw, 0.8rem)', { lineHeight: '1.4' }],
        'sm': ['clamp(0.875rem, 0.8rem + 0.3vw, 0.95rem)', { lineHeight: '1.5' }],
        'base': ['clamp(1rem, 0.95rem + 0.25vw, 1.125rem)', { lineHeight: '1.6' }],
        'lg': ['clamp(1.125rem, 1rem + 0.5vw, 1.25rem)', { lineHeight: '1.5' }],
        'xl': ['clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)', { lineHeight: '1.4' }],
        '2xl': ['clamp(1.5rem, 1.3rem + 0.8vw, 1.875rem)', { lineHeight: '1.3' }],
        '3xl': ['clamp(1.875rem, 1.6rem + 1vw, 2.25rem)', { lineHeight: '1.2' }],
        '4xl': ['clamp(2.25rem, 1.9rem + 1.4vw, 3rem)', { lineHeight: '1.1' }],
        '5xl': ['clamp(3rem, 2.5rem + 2vw, 3.75rem)', { lineHeight: '1' }],
        '6xl': ['clamp(3.75rem, 3rem + 3vw, 4.5rem)', { lineHeight: '1' }],
      },

      // Enhanced Border Radius System
      borderRadius: {
        'none': '0',
        'sm': 'var(--radius-sm)',
        'base': 'var(--radius-base)',
        'md': 'var(--radius-md)',
        'lg': 'var(--radius-lg)',
        'xl': 'var(--radius-xl)',
        '2xl': 'var(--radius-2xl)',
        '3xl': 'var(--radius-3xl)',
        'full': 'var(--radius-full)',
      },

      // Design Token Color System
      colors: {
        // Design Token Integration
        'ds-primary': {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          200: 'var(--color-primary-200)',
          300: 'var(--color-primary-300)',
          400: 'var(--color-primary-400)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
          950: 'var(--color-primary-950)',
        },
        'ds-secondary': {
          50: 'var(--color-secondary-50)',
          100: 'var(--color-secondary-100)',
          200: 'var(--color-secondary-200)',
          300: 'var(--color-secondary-300)',
          400: 'var(--color-secondary-400)',
          500: 'var(--color-secondary-500)',
          600: 'var(--color-secondary-600)',
          700: 'var(--color-secondary-700)',
          800: 'var(--color-secondary-800)',
          900: 'var(--color-secondary-900)',
          950: 'var(--color-secondary-950)',
        },
        'ds-accent': {
          50: 'var(--color-accent-50)',
          100: 'var(--color-accent-100)',
          200: 'var(--color-accent-200)',
          300: 'var(--color-accent-300)',
          400: 'var(--color-accent-400)',
          500: 'var(--color-accent-500)',
          600: 'var(--color-accent-600)',
          700: 'var(--color-accent-700)',
          800: 'var(--color-accent-800)',
          900: 'var(--color-accent-900)',
          950: 'var(--color-accent-950)',
        },
        'ds-success': {
          50: 'var(--color-success-50)',
          100: 'var(--color-success-100)',
          200: 'var(--color-success-200)',
          300: 'var(--color-success-300)',
          400: 'var(--color-success-400)',
          500: 'var(--color-success-500)',
          600: 'var(--color-success-600)',
          700: 'var(--color-success-700)',
          800: 'var(--color-success-800)',
          900: 'var(--color-success-900)',
          950: 'var(--color-success-950)',
        },
        'ds-warning': {
          50: 'var(--color-warning-50)',
          100: 'var(--color-warning-100)',
          200: 'var(--color-warning-200)',
          300: 'var(--color-warning-300)',
          400: 'var(--color-warning-400)',
          500: 'var(--color-warning-500)',
          600: 'var(--color-warning-600)',
          700: 'var(--color-warning-700)',
          800: 'var(--color-warning-800)',
          900: 'var(--color-warning-900)',
          950: 'var(--color-warning-950)',
        },
        'ds-error': {
          50: 'var(--color-error-50)',
          100: 'var(--color-error-100)',
          200: 'var(--color-error-200)',
          300: 'var(--color-error-300)',
          400: 'var(--color-error-400)',
          500: 'var(--color-error-500)',
          600: 'var(--color-error-600)',
          700: 'var(--color-error-700)',
          800: 'var(--color-error-800)',
          900: 'var(--color-error-900)',
          950: 'var(--color-error-950)',
        },
        'ds-neutral': {
          0: 'var(--color-neutral-0)',
          50: 'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          500: 'var(--color-neutral-500)',
          600: 'var(--color-neutral-600)',
          700: 'var(--color-neutral-700)',
          800: 'var(--color-neutral-800)',
          900: 'var(--color-neutral-900)',
          950: 'var(--color-neutral-950)',
          1000: 'var(--color-neutral-1000)',
        },

        // Semantic Colors
        'ds-bg': {
          primary: 'var(--color-bg-primary)',
          secondary: 'var(--color-bg-secondary)',
          tertiary: 'var(--color-bg-tertiary)',
          elevated: 'var(--color-bg-elevated)',
          overlay: 'var(--color-bg-overlay)',
          backdrop: 'var(--color-bg-backdrop)',
        },
        'ds-text': {
          primary: 'var(--color-text-primary)',
          secondary: 'var(--color-text-secondary)',
          tertiary: 'var(--color-text-tertiary)',
          placeholder: 'var(--color-text-placeholder)',
          disabled: 'var(--color-text-disabled)',
          inverse: 'var(--color-text-inverse)',
          accent: 'var(--color-text-accent)',
        },
        'ds-border': {
          primary: 'var(--color-border-primary)',
          secondary: 'var(--color-border-secondary)',
          focus: 'var(--color-border-focus)',
          error: 'var(--color-border-error)',
          success: 'var(--color-border-success)',
          warning: 'var(--color-border-warning)',
        },
        'ds-surface': {
          glass: 'var(--color-surface-glass)',
          'glass-strong': 'var(--color-surface-glass-strong)',
          'tint-blue': 'var(--color-surface-tint-blue)',
          'tint-purple': 'var(--color-surface-tint-purple)',
          'tint-success': 'var(--color-surface-tint-success)',
          'tint-warning': 'var(--color-surface-tint-warning)',
          'tint-error': 'var(--color-surface-tint-error)',
        },

        // Legacy Colors (maintained for compatibility)
        brand: "#E1E7EC",
        blue: {
          "300": "#94b2fa",
          "500": "#326DF5",
          "700": "#1F326F",
        },
        gray: colors.zinc,
        
        // Shadcn/UI Integration
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
      },

      // Enhanced Spacing System
      spacing: {
        '0.5': 'var(--space-0-5)',
        '1.5': 'var(--space-1-5)',
        '2.5': 'var(--space-2-5)',
        '3.5': 'var(--space-3-5)',
        '13': 'var(--space-52)',
        '15': 'var(--space-60)',
        '17': 'var(--space-68)',
        '18': 'var(--space-72)',
        '19': 'var(--space-76)',
        '21': 'var(--space-84)',
        '22': 'var(--space-88)',
        '23': 'var(--space-92)',
        '25': 'var(--space-100)',
        '26': 'var(--space-104)',
        '27': 'var(--space-108)',
        '29': 'var(--space-116)',
        '30': 'var(--space-120)',
        '31': 'var(--space-124)',
        '33': 'var(--space-132)',
        '34': 'var(--space-136)',
        '35': 'var(--space-140)',
        '37': 'var(--space-148)',
        '38': 'var(--space-152)',
        '39': 'var(--space-156)',
        '41': 'var(--space-164)',
        '42': 'var(--space-168)',
        '43': 'var(--space-172)',
        '45': 'var(--space-180)',
        '46': 'var(--space-184)',
        '47': 'var(--space-188)',
        '49': 'var(--space-196)',
        '50': 'var(--space-200)',
        '51': 'var(--space-204)',
        '53': 'var(--space-212)',
        '54': 'var(--space-216)',
        '55': 'var(--space-220)',
        '57': 'var(--space-228)',
        '58': 'var(--space-232)',
        '59': 'var(--space-236)',
        '61': 'var(--space-244)',
        '62': 'var(--space-248)',
        '63': 'var(--space-252)',
        '65': 'var(--space-260)',
        '66': 'var(--space-264)',
        '67': 'var(--space-268)',
        '68': 'var(--space-272)',
        '69': 'var(--space-276)',
        '70': 'var(--space-280)',
        '71': 'var(--space-284)',
        '73': 'var(--space-292)',
        '74': 'var(--space-296)',
        '75': 'var(--space-300)',
        '76': 'var(--space-304)',
        '77': 'var(--space-308)',
        '78': 'var(--space-312)',
        '79': 'var(--space-316)',
        '81': 'var(--space-324)',
        '82': 'var(--space-328)',
        '83': 'var(--space-332)',
        '84': 'var(--space-336)',
        '85': 'var(--space-340)',
        '86': 'var(--space-344)',
        '87': 'var(--space-348)',
        '88': 'var(--space-352)',
        '89': 'var(--space-356)',
        '90': 'var(--space-360)',
        '91': 'var(--space-364)',
        '92': 'var(--space-368)',
        '93': 'var(--space-372)',
        '94': 'var(--space-376)',
        '95': 'var(--space-380)',
      },

      // Enhanced Shadow System
      boxShadow: {
        'xs': 'var(--shadow-xs)',
        'sm': 'var(--shadow-sm)',
        'base': 'var(--shadow-base)',
        'md': 'var(--shadow-md)',
        'lg': 'var(--shadow-lg)',
        'xl': 'var(--shadow-xl)',
        '2xl': 'var(--shadow-2xl)',
        'inner': 'var(--shadow-inner)',
        'inner-lg': 'var(--shadow-inner-lg)',
        'primary': 'var(--shadow-primary)',
        'success': 'var(--shadow-success)',
        'warning': 'var(--shadow-warning)',
        'error': 'var(--shadow-error)',
      },

      // Enhanced Animation System
      transitionDuration: {
        'instant': 'var(--duration-instant)',
        'fast': 'var(--duration-fast)',
        'normal': 'var(--duration-normal)',
        'slow': 'var(--duration-slow)',
        'slower': 'var(--duration-slower)',
      },

      transitionTimingFunction: {
        'in': 'var(--ease-in)',
        'out': 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
        'back': 'var(--ease-back)',
        'bounce': 'var(--ease-bounce)',
      },

      // Enhanced Z-Index System
      zIndex: {
        'behind': 'var(--z-behind)',
        'normal': 'var(--z-normal)',
        'tooltip': 'var(--z-tooltip)',
        'fixed': 'var(--z-fixed)',
        'modal-backdrop': 'var(--z-modal-backdrop)',
        'modal': 'var(--z-modal)',
        'popover': 'var(--z-popover)',
        'toast': 'var(--z-toast)',
        'maximum': 'var(--z-maximum)',
      },
    },
  },
  plugins: [
    typography,
    animate,
    // Custom plugin for design system utilities
    function({ addUtilities, theme }: any) {
      const newUtilities = {
        // Glass morphism utilities
        '.surface-glass': {
          background: 'var(--color-surface-glass)',
          backdropFilter: 'blur(12px)',
          border: '1px solid var(--color-border-primary)',
        },
        '.surface-glass-strong': {
          background: 'var(--color-surface-glass-strong)',
          backdropFilter: 'blur(20px)',
          border: '1px solid var(--color-border-primary)',
        },
        
        // Text utilities
        '.text-balance': {
          textWrap: 'balance',
        },
        '.text-pretty': {
          textWrap: 'pretty',
        },
        
        // Spacing utilities
        '.space-stack > * + *': {
          marginTop: 'var(--space-4)',
        },
        '.space-stack-sm > * + *': {
          marginTop: 'var(--space-2)',
        },
        '.space-stack-lg > * + *': {
          marginTop: 'var(--space-6)',
        },
      };
      
      addUtilities(newUtilities);
    }
  ],
};

export default config;
