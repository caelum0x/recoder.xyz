export const DESIGN_SYSTEM_PROMPT = `
When generating UI components:

1. **Design System**: Use Tailwind CSS with modern design principles
2. **Responsive**: Mobile-first approach, use responsive classes
3. **Accessibility**: WCAG 2.1 compliant, proper ARIA labels
4. **Spacing**: Consistent spacing scale (4, 8, 12, 16, 24, 32, 48, 64px)
5. **Typography**: Clear hierarchy, readable font sizes
6. **Colors**: Proper contrast ratios (4.5:1 for text)
7. **States**: Include hover, focus, active, disabled states
8. **Loading**: Add loading states for async operations
9. **Errors**: Handle and display errors gracefully
10. **Animations**: Subtle transitions (200-300ms)
`;

export const STYLE_PRESETS = {
  minimal: {
    name: 'Minimal',
    prompt: 'Clean, minimal design with lots of whitespace. Neutral colors, simple borders.',
  },
  modern: {
    name: 'Modern',
    prompt: 'Modern design with gradients, shadows, and rounded corners. Vibrant colors.',
  },
  playful: {
    name: 'Playful',
    prompt: 'Fun, playful design with bright colors, bold typography, and animations.',
  },
  professional: {
    name: 'Professional',
    prompt: 'Professional, corporate design. Muted colors, clean lines, formal typography.',
  },
};

export function getDesignPrompt(style: keyof typeof STYLE_PRESETS = 'modern'): string {
  return `${DESIGN_SYSTEM_PROMPT}\n\nStyle: ${STYLE_PRESETS[style].prompt}`;
}
