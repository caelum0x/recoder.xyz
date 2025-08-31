# Recoder.xyz Design System

A comprehensive, professional design system for the entire Recoder.xyz ecosystem, providing consistent visual language and user experience across all platforms.

## 🎨 Design Philosophy

The Recoder Design System is built on five core principles:

1. **Consistency** - Unified experience across recoder-main, recoder-chat, and recoder-web
2. **Accessibility** - WCAG 2.1 AA compliant components and color contrasts
3. **Scalability** - Token-based system that scales from mobile to desktop
4. **Performance** - Optimized for fast load times and smooth animations
5. **Developer Experience** - Easy to use, well-documented, and TypeScript-first

## 🏗️ Architecture

The design system is organized into four main modules:

- **`colors.ts`** - Color palette, themes, and semantic color assignments
- **`typography.ts`** - Font families, sizes, weights, and typography scales
- **`spacing.ts`** - Spacing units, layout tokens, shadows, and responsive breakpoints
- **`components.ts`** - Component variants, animations, and utility classes

## 📦 Installation & Usage

### Basic Usage

```typescript
import { 
  colors, 
  lightTheme, 
  darkTheme, 
  buttonVariants, 
  spacing,
  typographyScale 
} from '../design-system';

// Use color tokens
const primaryButton = {
  backgroundColor: colors.primary[500],
  color: colors.neutral[0],
  padding: spacing[16],
};

// Use component variants
const button = {
  ...buttonVariants.primary,
  ...buttonSizes.md,
};

// Use typography scale
const heading = {
  ...typographyScale.heading.h1,
  fontFamily: fontFamilies.heading.join(', '),
};
```

### CSS Custom Properties

Generate CSS variables for any theme:

```typescript
import { generateCSSVariables } from '../design-system';

// Generate light theme variables
const lightVars = generateCSSVariables('light');

// Generate dark theme variables
const darkVars = generateCSSVariables('dark');

// Apply to CSS
:root {
  ${Object.entries(lightVars).map(([key, value]) => `${key}: ${value};`).join('\n  ')}
}

[data-theme="dark"] {
  ${Object.entries(darkVars).map(([key, value]) => `${key}: ${value};`).join('\n  ')}
}
```

### Responsive Design

Use media query helpers for consistent breakpoints:

```typescript
import { mediaQueries, breakpoints } from '../design-system';

const responsiveStyles = {
  fontSize: '1rem',
  [mediaQueries.sm]: {
    fontSize: '1.125rem',
  },
  [mediaQueries.lg]: {
    fontSize: '1.25rem',
  },
  [mediaQueries.mobile]: {
    padding: spacing[12],
  },
  [mediaQueries.desktop]: {
    padding: spacing[24],
  },
};
```

## 🎨 Color System

### Brand Colors

- **Primary**: Blue scale (#0ea5e9) - Main brand color for CTAs and links
- **Secondary**: Gray scale (#64748b) - Supporting colors and text
- **Success**: Green scale (#22c55e) - Success states and positive actions
- **Warning**: Yellow scale (#f59e0b) - Warning states and caution
- **Error**: Red scale (#ef4444) - Error states and destructive actions

### Themes

- **Light Theme**: Clean, bright interface for day use
- **Dark Theme**: Comfortable, low-light interface for night use
- **High Contrast**: Accessibility-focused theme with enhanced contrast

### Gradients

Pre-defined gradients for modern, engaging interfaces:

```typescript
colors.gradient.primary // Blue gradient
colors.gradient.sunset  // Orange to red gradient
colors.gradient.ocean   // Cyan to blue gradient
colors.gradient.purple  // Purple gradient
```

### Glass Morphism

Translucent colors for modern glass effects:

```typescript
colors.glass.light   // Light glass overlay
colors.glass.medium  // Medium glass overlay
colors.glass.dark    // Dark glass overlay
colors.glass.backdrop // Backdrop blur effect
```

## 📝 Typography

### Font Families

- **Sans**: Inter + system font stack for UI text
- **Mono**: JetBrains Mono + system monospace for code
- **Heading**: Cal Sans + Inter for display headings

### Typography Scale

Organized by use case for consistent text hierarchy:

- **Display**: Large marketing headings (72px - 30px)
- **Heading**: Standard headings H1-H6 (36px - 16px) 
- **Body**: Paragraph text (20px - 12px)
- **UI**: Interface elements (16px - 10px)
- **Code**: Monospace code text (18px - 12px)

### Usage Examples

```typescript
// Display heading
const hero = {
  ...typographyScale.display.xl,
  fontFamily: fontFamilies.heading.join(', '),
};

// Body text
const paragraph = {
  ...typographyScale.body.md,
  color: lightTheme.text.primary,
};

// Code block
const codeBlock = {
  ...typographyScale.code.lg,
  backgroundColor: colors.code.background,
  color: colors.code.string,
};
```

## 📐 Spacing & Layout

### Spacing Scale

Based on 4px base unit for mathematical consistency:

- **Micro**: 1px - 4px (borders, fine details)
- **Small**: 6px - 16px (component padding, gaps)
- **Medium**: 20px - 32px (section spacing, cards)
- **Large**: 40px - 96px (layout spacing, margins)
- **Macro**: 112px+ (page sections, major layouts)

### Component Spacing

Pre-defined spacing for common components:

```typescript
// Button padding
componentSpacing.button.padding.md // { x: '16px', y: '8px' }

// Card padding
componentSpacing.card.padding.lg // '24px'

// Layout sections
componentSpacing.layout.section.xl // '96px'
```

### Shadows

Elevation system for layered interfaces:

```typescript
shadows.sm   // Subtle card shadow
shadows.lg   // Elevated modal shadow
shadows.xl   // High-elevation overlay
shadows.primary // Colored primary shadow
shadows.glass   // Glass morphism shadow
```

### Border Radius

Consistent rounding for modern interfaces:

```typescript
borderRadius.sm   // 2px - Subtle rounding
borderRadius.md   // 4px - Standard buttons
borderRadius.lg   // 6px - Cards and inputs
borderRadius.xl   // 8px - Large components
borderRadius['2xl'] // 12px - Modals
borderRadius.full   // 9999px - Pills and circles
```

## 🧩 Components

### Button Variants

Professional button styles for all use cases:

```typescript
buttonVariants.primary    // Main CTA button
buttonVariants.secondary  // Secondary actions
buttonVariants.ghost      // Subtle text button
buttonVariants.destructive // Delete/remove actions
buttonVariants.outline    // Outlined button
buttonVariants.gradient   // Gradient brand button
buttonVariants.glass      // Glass morphism button
```

### Card Variants

Flexible card components for content display:

```typescript
cardVariants.default   // Standard card with border
cardVariants.elevated  // Floating card with shadow
cardVariants.glass     // Glass morphism card
cardVariants.gradient  // Gradient background card
cardVariants.outline   // Minimal outlined card
```

### Input Variants

Consistent form inputs across platforms:

```typescript
inputVariants.default  // Standard bordered input
inputVariants.filled   // Filled background input
inputVariants.ghost    // Underlined minimal input
```

### Alert Variants

Contextual feedback for user actions:

```typescript
alertVariants.success  // Success confirmation
alertVariants.warning  // Warning notification
alertVariants.error    // Error message
alertVariants.info     // Information notice
```

## 🎬 Animation System

### Pre-built Animations

Smooth, accessible animations for better UX:

```typescript
animations.fadeIn     // Gentle fade in
animations.fadeInUp   // Fade in with upward motion
animations.slideIn    // Slide in from left
animations.scaleIn    // Scale up entrance
animations.spin       // Loading spinner
animations.pulse      // Attention grabber
animations.bounce     // Playful bounce effect
```

### Transitions

Consistent timing for state changes:

```typescript
transitions.default   // Standard all-property transition
transitions.fast      // Quick interactions
transitions.colors    // Color-only transitions
transitions.transform // Transform-only transitions
```

### Timing & Easing

Carefully tuned timing for natural motion:

```typescript
timing.fast      // 150ms - Quick interactions
timing.normal    // 200ms - Standard transitions
timing.slow      // 300ms - Complex animations
timing.slower    // 500ms - Page transitions

easing.easeOut   // Natural deceleration
easing.spring    // Bouncy spring effect
easing.bounce    // Playful bounce easing
```

## 📱 Responsive Design

### Breakpoints

Mobile-first responsive breakpoints:

```typescript
breakpoints.xs   // 475px - Large phones
breakpoints.sm   // 640px - Tablets
breakpoints.md   // 768px - Small laptops
breakpoints.lg   // 1024px - Laptops
breakpoints.xl   // 1280px - Desktops
breakpoints['2xl'] // 1536px - Large screens
```

### Media Queries

Convenient helpers for responsive design:

```typescript
mediaQueries.mobile    // Mobile devices
mediaQueries.tablet    // Tablet devices
mediaQueries.desktop   // Desktop devices
mediaQueries.darkMode  // Dark mode preference
mediaQueries.reducedMotion // Reduced motion preference
```

### Grid System

Flexible 12-column grid with responsive gaps:

```typescript
grid.columns // 12
grid.gap.sm  // 16px
grid.gap.lg  // 24px
grid.container.maxWidth // 80rem (1280px)
```

## ♿ Accessibility

### Color Contrast

All color combinations meet WCAG 2.1 AA standards:

- Text on backgrounds: 4.5:1 minimum contrast ratio
- Large text (18pt+): 3:1 minimum contrast ratio  
- Interactive elements: Enhanced contrast for focus states

### Focus Management

Consistent focus indicators across all components:

```typescript
// Focus ring for interactive elements
const focusRing = {
  outline: 'none',
  boxShadow: `0 0 0 3px ${colors.primary[500]}40`,
};
```

### Screen Reader Support

Components include proper ARIA attributes and semantic markup:

- Descriptive labels and roles
- Live regions for dynamic content
- Keyboard navigation support
- Screen reader optimized text

## 🛠️ Development Guidelines

### Component Creation

Use the helper function to create consistent components:

```typescript
import { createComponent } from '../design-system';

const MyComponent = createComponent(
  // Base styles
  {
    display: 'flex',
    alignItems: 'center',
    transition: transitions.default,
  },
  // Variants
  {
    primary: { backgroundColor: colors.primary[500] },
    secondary: { backgroundColor: colors.secondary[500] },
  },
  // Sizes
  {
    sm: { padding: spacing[8] },
    md: { padding: spacing[12] },
    lg: { padding: spacing[16] },
  }
);

// Usage
const styles = MyComponent.compose('primary', 'md');
```

### Theme Switching

Implement theme switching with CSS custom properties:

```typescript
// Toggle theme function
const toggleTheme = (theme: 'light' | 'dark') => {
  const variables = generateCSSVariables(theme);
  
  Object.entries(variables).forEach(([property, value]) => {
    document.documentElement.style.setProperty(property, value);
  });
  
  document.documentElement.setAttribute('data-theme', theme);
};
```

### Performance Optimization

- Use CSS custom properties for theme switching
- Implement CSS-in-JS with minimal runtime overhead
- Load only necessary fonts and icons
- Use system fonts as fallbacks
- Optimize for Core Web Vitals

## 📖 Platform Integration

### Recoder-Main (Landing Website)

Focus on marketing and conversion:

```typescript
// Hero section styling
const heroSection = {
  ...typographyScale.display['2xl'],
  background: colors.gradient.primary,
  color: colors.neutral[0],
  padding: componentSpacing.layout.section.xl,
};

// Feature cards
const featureCard = {
  ...cardVariants.elevated,
  hover: cardVariants.elevated.hover,
  transition: transitions.default,
};
```

### Recoder-Chat (Communication Platform)

Emphasis on readability and conversation flow:

```typescript
// Message bubbles
const messageBubble = {
  ...cardVariants.default,
  backgroundColor: colors.chat.userBubble,
  color: colors.neutral[0],
  maxWidth: '70%',
  borderRadius: borderRadius['2xl'],
};

// Sidebar navigation
const chatSidebar = {
  backgroundColor: lightTheme.surface,
  borderRight: `1px solid ${lightTheme.border}`,
  padding: componentSpacing.chat.sidebarPadding,
};
```

### Recoder-Web (Code Builder)

Optimized for development workflows:

```typescript
// Code editor
const codeEditor = {
  backgroundColor: colors.code.background,
  color: colors.code.string,
  fontFamily: fontFamilies.mono.join(', '),
  padding: componentSpacing.codeEditor.padding,
  borderRadius: borderRadius.lg,
};

// Tool panels
const toolPanel = {
  ...cardVariants.default,
  backgroundColor: lightTheme.surface,
  borderColor: lightTheme.border,
};
```

## 🚀 Getting Started

1. **Import the design system** in your project
2. **Apply CSS variables** for theme support
3. **Use component variants** for consistent styling
4. **Follow spacing guidelines** for layouts
5. **Test accessibility** with screen readers
6. **Validate responsive** behavior across devices

## 📚 Resources

- **Figma Design File**: [Link to Figma]
- **Storybook**: [Link to component documentation]
- **GitHub Repository**: [Link to source code]
- **Accessibility Audit**: [Link to audit results]

## 🤝 Contributing

1. Follow the established design principles
2. Maintain consistent naming conventions
3. Add proper TypeScript types
4. Include accessibility considerations
5. Test across all supported platforms
6. Update documentation for changes

---

Built with ❤️ for the Recoder.xyz ecosystem
