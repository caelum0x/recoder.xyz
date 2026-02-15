/**
 * Built-in Design System Themes
 * Each theme provides a <theme></theme> wrapped system prompt that instructs the AI
 * on color systems, typography, component guidelines, motion, and layout.
 */

export interface BuiltinTheme {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export const BUILTIN_THEMES: BuiltinTheme[] = [
  {
    id: 'default',
    name: 'Modern Colorful',
    description: 'Vibrant, modern, mobile-first design with rich gradients and smooth animations.',
    prompt: `<theme>
DESIGN SYSTEM: Modern Colorful

COLOR SYSTEM:
- Primary: Use vibrant, saturated colors (e.g., indigo-600, violet-500, blue-600)
- Gradients: Use multi-stop gradients (from-indigo-500 via-purple-500 to-pink-500)
- Backgrounds: Light mode: white/gray-50, Dark mode: gray-900/gray-950
- Accent: Use complementary warm colors (amber, orange) for CTAs and highlights
- Semantic: green-500 for success, red-500 for error, yellow-500 for warning, blue-500 for info

TYPOGRAPHY:
- Headings: Bold (font-bold), large sizes, optional gradient text (bg-gradient-to-r bg-clip-text text-transparent)
- Body: text-gray-700 (light) / text-gray-300 (dark), leading-relaxed
- Use tracking-tight on headings, tracking-normal on body
- Font stack: system-ui with Inter/Plus Jakarta Sans feel

COMPONENTS:
- Cards: rounded-2xl with subtle shadow-lg, border border-gray-200/50, hover:shadow-xl transition
- Buttons: rounded-xl px-6 py-3, gradient backgrounds, hover:scale-[1.02] transition-transform
- Inputs: rounded-xl border-2 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500
- Badges/Pills: rounded-full px-3 py-1 text-sm font-medium
- Use backdrop-blur-xl and bg-white/80 for glass-morphism effects

MOTION:
- All interactive elements: transition-all duration-200
- Hover effects: translate, scale, shadow changes
- Page transitions: fade-in with slight upward movement
- Use animate-pulse for loading states, animate-bounce for attention

LAYOUT:
- Mobile-first responsive: base → sm → md → lg → xl breakpoints
- Max content width: max-w-7xl mx-auto
- Generous padding: p-6 on containers, gap-6 on grids
- Use grid with auto-fit columns: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3
</theme>`,
  },
  {
    id: 'minimal',
    name: 'Clean Minimal',
    description: 'Whitespace-heavy, subtle animations, monochromatic palette with one accent.',
    prompt: `<theme>
DESIGN SYSTEM: Clean Minimal

COLOR SYSTEM:
- Primary: Monochromatic — gray-900 for text, gray-100 for backgrounds
- Accent: Single accent color only (e.g., blue-600 or emerald-600) — used sparingly for links, active states, and primary CTA
- Backgrounds: white (light), gray-950 (dark) — never use colored backgrounds on sections
- Borders: gray-200 (light) / gray-800 (dark), always 1px
- No gradients. No multi-color schemes.

TYPOGRAPHY:
- Headings: font-light or font-normal, large sizes (text-4xl+), text-gray-900 / text-white
- Body: text-gray-600 (light) / text-gray-400 (dark), leading-loose (generous line-height)
- Use letter-spacing: tracking-wide on uppercase labels, tracking-tight on headings
- Prefer sans-serif: system fonts or Inter

COMPONENTS:
- Cards: rounded-lg border border-gray-200 bg-white — minimal shadow (shadow-sm or none)
- Buttons: rounded-md, outlined or text-only for secondary; solid accent for primary only
- Inputs: border-b-2 border-gray-300 bg-transparent — underline style preferred over boxed
- Dividers: border-t border-gray-100 — use whitespace instead of borders where possible
- No icon-heavy designs. Prefer text labels over icons.

MOTION:
- Subtle only: opacity transitions (duration-300) and gentle translate-y
- No bouncing, no scaling, no dramatic shadows on hover
- Hover: opacity-80 or underline for links
- Loading: simple spinner or pulsing dot

LAYOUT:
- Generous whitespace: py-16 px-8 on sections, gap-8 or gap-12 between elements
- Narrow content: max-w-3xl for text-heavy pages, max-w-5xl for dashboards
- Single column preferred, two columns max on desktop
- Asymmetric layouts welcome (e.g., left-aligned text with right whitespace)
</theme>`,
  },
  {
    id: 'bold',
    name: 'Bold & Dramatic',
    description: 'Strong colors, large typography, dramatic contrast, and impactful design.',
    prompt: `<theme>
DESIGN SYSTEM: Bold & Dramatic

COLOR SYSTEM:
- Primary: Deep, rich colors — black, dark navy (gray-950), with vivid accent (red-500, yellow-400, or electric blue-500)
- Contrast: High-contrast pairs — white text on dark backgrounds, black text on bright accents
- Backgrounds: Dark by default (gray-950, black), sections with full-width accent color blocks
- Accent usage: Large blocks of color, not just small highlights
- Avoid pastels entirely. Use full-saturation colors.

TYPOGRAPHY:
- Headings: text-6xl to text-8xl, font-black (900 weight), uppercase with tracking-wider
- Body: text-lg font-medium, text-gray-300 on dark backgrounds
- Display text: Use oversized type as a design element (text-[8rem] for hero text)
- Prefer bold geometric sans-serif fonts (like Manrope or Space Grotesk feel)

COMPONENTS:
- Cards: bg-gray-900 rounded-none or rounded-sm, border-2 border-white/10, no shadow
- Buttons: Large — px-8 py-4 text-lg font-bold uppercase tracking-wider, accent background, no rounded (rounded-none or rounded-sm)
- Inputs: border-2 border-white/20 bg-black text-white — thick borders, large padding
- Badges: Rectangular (rounded-sm), uppercase, bold, accent background
- Use border-4 and ring-4 for emphasis states

MOTION:
- Impactful: scale-105 on hover, transition-transform duration-150 (snappy, not gentle)
- Entrance: slide-in-from-bottom with opacity, stagger children
- Use clip-path and transform for creative transitions
- No subtle fades — prefer definitive state changes

LAYOUT:
- Full-bleed sections: w-full with no max-width constraints
- Large negative space between sections (py-24 to py-32)
- Grid: 2-column asymmetric layouts (60/40 or 70/30 splits)
- Overlapping elements and z-index layering for depth
</theme>`,
  },
  {
    id: 'playful',
    name: 'Playful & Fun',
    description: 'Rounded shapes, bright palette, fun micro-interactions and whimsical design.',
    prompt: `<theme>
DESIGN SYSTEM: Playful & Fun

COLOR SYSTEM:
- Primary: Bright, cheerful palette — pink-500, sky-400, violet-500, amber-400, lime-400
- Multi-color: Use different colors for different sections/features (like a candy palette)
- Backgrounds: Soft pastels (pink-50, sky-50, violet-50) or white with colored accents
- Dark mode: Deep purple (purple-950) or dark teal (teal-950) instead of gray
- Emoji and icon colors should be vibrant and varied

TYPOGRAPHY:
- Headings: font-bold rounded fonts, text-3xl to text-5xl, fun colors per section
- Body: text-gray-700 / text-gray-300, leading-relaxed, text-base to text-lg
- Use playful touches: rotated text (-rotate-2), wavy underlines, colored highlights
- Prefer rounded, friendly fonts (like Nunito or Quicksand feel)

COMPONENTS:
- Cards: rounded-3xl bg-white shadow-lg border-2 border-dashed or border-dotted (colored)
- Buttons: rounded-full px-6 py-3, colorful backgrounds, hover:rotate-1 hover:scale-105
- Inputs: rounded-2xl border-2 border-pink-300 focus:border-violet-500 bg-white
- Badges: rounded-full with emoji prefix, colorful backgrounds (bg-pink-100 text-pink-700)
- Use blob/organic shapes for decorative backgrounds (clip-path or SVG)

MOTION:
- Bouncy: hover:scale-110 with transition-all duration-300 ease-bounce
- Entrance: animate-bounce-in or slide-up with overshoot easing
- Micro-interactions: wiggle on hover (animate-wiggle), color transitions on focus
- Loading: Bouncing dots or spinning emoji
- Use rotate and skew for playful hover states

LAYOUT:
- Varied layouts: masonry-style grids, offset cards, overlapping elements
- Max width: max-w-6xl, generous padding (p-8)
- Grid: grid-cols-2 md:grid-cols-3 with gap-6
- Use decorative elements: floating shapes, confetti borders, doodle-style separators
- Cards at slight angles: -rotate-1 to rotate-2 on alternating items
</theme>`,
  },
];
