# Recoder.xyz Logo Specifications

## Logo Concepts & Design Guidelines

### Primary Logo Design
The Recoder.xyz logo should embody:
- **Intelligence**: AI-powered development capabilities
- **Precision**: Accurate, production-ready code generation  
- **Innovation**: Cutting-edge multi-AI integration
- **Reliability**: Offline-first, always-available platform

### Logo Variations Required

#### 1. **Primary Logo** (`recoder-logo-primary.svg`)
- Full horizontal layout with text
- Used for headers, documentation, marketing materials
- Minimum width: 120px
- Available in: SVG, PNG (multiple sizes)

#### 2. **Icon Logo** (`recoder-icon.svg`) 
- Square format for app icons, favicons
- Sizes: 16x16, 32x32, 64x64, 128x128, 256x256, 512x512
- Used for: VS Code extension icon, web app favicon, CLI branding

#### 3. **Monogram** (`recoder-monogram.svg`)
- Single letter "R" or combined "RX" 
- For tight spaces, loading states, watermarks
- Minimum size: 12px

#### 4. **Wordmark** (`recoder-wordmark.svg`)
- Text-only version without icon
- For cases where the icon doesn't work well
- Typography-focused branding

### Color Variations

#### Light Theme
- **Primary**: Full color on light backgrounds
- **Dark**: Dark version for light backgrounds  
- **Monochrome**: Single color (black/dark gray)

#### Dark Theme  
- **Primary**: Full color on dark backgrounds
- **Light**: Light version for dark backgrounds
- **Monochrome**: Single color (white/light gray)

### Logo Construction

#### Geometric Foundation
```
Logo should be built on a geometric grid:
- Base unit: 8px
- Icon area: 32x32 units (256px at base scale)
- Text height: 16 units (128px at base scale)
- Spacing between icon and text: 4 units (32px)
```

#### Typography Integration
- Font: Outfit (display font from typography system)
- Weight: Bold (700)
- Letter spacing: -0.025em (tight)
- Color: Matches brand primary or uses gradient

#### Icon Concept Options

**Option A: Code Bracket + AI Spark**
```
[< >] with small AI sparkle/star in corner
Represents: Code generation with AI intelligence
```

**Option B: Layered "R" with Circuit Pattern**
```
Letter R with subtle circuit board pattern
Represents: Recoder + technology integration
```

**Option C: Gradient Hexagon with "R"**
```
Hexagonal badge with centered R
Represents: Strength, precision, development
```

### Usage Guidelines

#### Minimum Sizes
- Icon only: 16px minimum
- Logo with text: 120px width minimum
- Monogram: 12px minimum

#### Clear Space
- Maintain clear space equal to the height of the "R" around all sides
- No other elements should appear in this space

#### Incorrect Usage
❌ **Don't:**
- Stretch or distort the logo
- Change colors outside brand palette
- Add drop shadows or effects
- Place on busy backgrounds without sufficient contrast
- Use low-resolution versions for print

✅ **Do:**
- Use vector formats when possible
- Maintain original proportions
- Ensure sufficient contrast with background
- Use appropriate size variations for context

### File Naming Convention

```
recoder-logo-[variation]-[theme]-[size].[format]

Examples:
- recoder-logo-primary-light.svg
- recoder-logo-primary-dark.svg  
- recoder-icon-light-256.png
- recoder-icon-dark-512.png
- recoder-monogram-light.svg
- recoder-wordmark-dark.svg
```

### Brand Applications

#### VS Code Extension
- Icon: 128x128 PNG (recoder-icon-light-128.png)
- Activity bar: 24x24 monochrome
- Command palette: 16x16 monochrome

#### Web Platform
- Header logo: Primary logo, responsive sizing
- Favicon: 32x32 ICO, 192x192 PNG, 512x512 PNG
- OG image integration: Logo on branded background

#### CLI Tool
- Terminal output: ASCII art version or simple text
- Documentation: Primary logo in headers
- Package managers: Icon versions for listings

#### Marketing Materials
- Social media: Square icon versions
- Documentation: Primary logo in various sizes
- Email signatures: Monogram or wordmark
- Business cards: Any variation based on layout

### Technical Specifications

#### SVG Requirements
- ViewBox: 0 0 [width] [height]
- Clean paths with minimal anchor points
- Embedded color information (no external stylesheets)
- Optimized file size (< 10KB for complex versions)

#### PNG Specifications
- Transparent backgrounds
- 24-bit color depth
- Optimized compression
- Multiple resolutions for different use cases

#### Accessibility
- Minimum contrast ratio: 4.5:1 against backgrounds
- Alternative text descriptions for screen readers
- Scalable vector formats preferred for clarity at all sizes

### Brand Evolution Notes
- Logo system designed to be flexible for future AI model integrations
- Color system supports both light and dark themes across all products  
- Geometric foundation allows for consistent scaling and adaptation
- Typography integration maintains readability at all sizes

---

*This specification should be used as a guide for creating the actual logo assets. The final designs should be created by a professional designer following these guidelines.*