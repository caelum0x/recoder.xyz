import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';

/**
 * POST /api/extract-brand-styles
 * Extracts CSS/design system from a website URL
 * Parses colors, fonts, spacing, etc.
 * Generates design tokens and Tailwind config
 */

// Types for Firecrawl branding response
interface FirecrawlBrandingData {
  name?: string;
  logo?: string;
  favicon?: string;
  colors?: {
    primary?: string;
    secondary?: string;
    accent?: string;
    background?: string;
    text?: string;
    [key: string]: string | undefined;
  };
  fonts?: {
    primary?: string;
    secondary?: string;
    heading?: string;
    body?: string;
    [key: string]: string | undefined;
  };
  metadata?: {
    title?: string;
    description?: string;
    [key: string]: string | undefined;
  };
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    branding?: FirecrawlBrandingData;
    [key: string]: unknown;
  };
  branding?: FirecrawlBrandingData;
}

// Types for extracted styles
interface DesignTokens {
  colors: {
    primary: ColorPalette;
    secondary?: ColorPalette;
    accent?: ColorPalette;
    neutral: ColorPalette;
    background: string;
    foreground: string;
    [key: string]: string | ColorPalette | undefined;
  };
  typography: {
    fontFamilies: {
      heading: string;
      body: string;
      mono?: string;
    };
    fontSizes: Record<string, string>;
    fontWeights: Record<string, number>;
    lineHeights: Record<string, string>;
  };
  spacing: Record<string, string>;
  borderRadius: Record<string, string>;
  shadows: Record<string, string>;
}

interface ColorPalette {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

interface TailwindConfig {
  theme: {
    extend: {
      colors: Record<string, string | Record<string, string>>;
      fontFamily: Record<string, string[]>;
      fontSize: Record<string, string>;
      spacing?: Record<string, string>;
      borderRadius: Record<string, string>;
      boxShadow: Record<string, string>;
    };
  };
}

interface ExtractBrandStylesResponse {
  success: boolean;
  url: string;
  styleName: string;
  guidelines: FirecrawlBrandingData;
  designTokens: DesignTokens;
  tailwindConfig: TailwindConfig;
  cssVariables: string;
}

// Helper to convert hex to RGB
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

// Helper to convert RGB to HSL
function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

// Helper to convert HSL to Hex
function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;

  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;

  if (0 <= h && h < 60) {
    r = c;
    g = x;
    b = 0;
  } else if (60 <= h && h < 120) {
    r = x;
    g = c;
    b = 0;
  } else if (120 <= h && h < 180) {
    r = 0;
    g = c;
    b = x;
  } else if (180 <= h && h < 240) {
    r = 0;
    g = x;
    b = c;
  } else if (240 <= h && h < 300) {
    r = x;
    g = 0;
    b = c;
  } else if (300 <= h && h < 360) {
    r = c;
    g = 0;
    b = x;
  }

  const toHex = (n: number) => {
    const hex = Math.round((n + m) * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

// Generate a full color palette from a base color
function generateColorPalette(baseColor: string): ColorPalette {
  const rgb = hexToRgb(baseColor);
  if (!rgb) {
    // Return a default gray palette if color parsing fails
    return {
      50: '#FAFAFA',
      100: '#F5F5F5',
      200: '#E5E5E5',
      300: '#D4D4D4',
      400: '#A3A3A3',
      500: '#737373',
      600: '#525252',
      700: '#404040',
      800: '#262626',
      900: '#171717',
      950: '#0A0A0A',
    };
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  // Generate shades by adjusting lightness
  return {
    50: hslToHex(hsl.h, Math.min(hsl.s, 30), 97),
    100: hslToHex(hsl.h, Math.min(hsl.s, 40), 94),
    200: hslToHex(hsl.h, Math.min(hsl.s, 50), 86),
    300: hslToHex(hsl.h, Math.min(hsl.s, 60), 74),
    400: hslToHex(hsl.h, Math.min(hsl.s, 70), 60),
    500: hslToHex(hsl.h, hsl.s, hsl.l), // Original color
    600: hslToHex(hsl.h, Math.min(hsl.s + 5, 100), Math.max(hsl.l - 10, 35)),
    700: hslToHex(hsl.h, Math.min(hsl.s + 10, 100), Math.max(hsl.l - 20, 25)),
    800: hslToHex(hsl.h, Math.min(hsl.s + 15, 100), Math.max(hsl.l - 30, 15)),
    900: hslToHex(hsl.h, Math.min(hsl.s + 20, 100), Math.max(hsl.l - 40, 10)),
    950: hslToHex(hsl.h, Math.min(hsl.s + 25, 100), Math.max(hsl.l - 45, 5)),
  };
}

// Generate neutral palette from background/text colors
function generateNeutralPalette(background?: string, text?: string): ColorPalette {
  // Default to a warm gray if no colors provided
  const baseGray = text || '#374151';
  const rgb = hexToRgb(baseGray);

  if (!rgb) {
    return {
      50: '#FAFAFA',
      100: '#F4F4F5',
      200: '#E4E4E7',
      300: '#D4D4D8',
      400: '#A1A1AA',
      500: '#71717A',
      600: '#52525B',
      700: '#3F3F46',
      800: '#27272A',
      900: '#18181B',
      950: '#09090B',
    };
  }

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

  return {
    50: hslToHex(hsl.h, Math.min(hsl.s, 5), 98),
    100: hslToHex(hsl.h, Math.min(hsl.s, 6), 96),
    200: hslToHex(hsl.h, Math.min(hsl.s, 8), 90),
    300: hslToHex(hsl.h, Math.min(hsl.s, 10), 83),
    400: hslToHex(hsl.h, Math.min(hsl.s, 12), 64),
    500: hslToHex(hsl.h, Math.min(hsl.s, 14), 46),
    600: hslToHex(hsl.h, Math.min(hsl.s, 16), 33),
    700: hslToHex(hsl.h, Math.min(hsl.s, 18), 25),
    800: hslToHex(hsl.h, Math.min(hsl.s, 20), 15),
    900: hslToHex(hsl.h, Math.min(hsl.s, 22), 9),
    950: hslToHex(hsl.h, Math.min(hsl.s, 24), 4),
  };
}

// Parse font family string to clean format
function parseFontFamily(fontString?: string): string {
  if (!fontString) return 'system-ui, sans-serif';

  // Remove quotes and clean up
  return fontString
    .split(',')
    .map((f) => f.trim().replace(/['"]/g, ''))
    .filter(Boolean)
    .join(', ');
}

// Generate design tokens from branding data
function generateDesignTokens(branding: FirecrawlBrandingData): DesignTokens {
  const colors = branding.colors || {};
  const fonts = branding.fonts || {};

  // Generate color palettes
  const primaryColor = colors.primary || '#3B82F6';
  const secondaryColor = colors.secondary;
  const accentColor = colors.accent;

  const colorTokens: DesignTokens['colors'] = {
    primary: generateColorPalette(primaryColor),
    neutral: generateNeutralPalette(colors.background, colors.text),
    background: colors.background || '#FFFFFF',
    foreground: colors.text || '#1F2937',
  };

  if (secondaryColor) {
    colorTokens.secondary = generateColorPalette(secondaryColor);
  }

  if (accentColor) {
    colorTokens.accent = generateColorPalette(accentColor);
  }

  // Add any additional colors from the branding
  Object.entries(colors).forEach(([key, value]) => {
    if (!['primary', 'secondary', 'accent', 'background', 'text'].includes(key) && value) {
      colorTokens[key] = value;
    }
  });

  // Typography tokens
  const headingFont = parseFontFamily(fonts.heading || fonts.primary);
  const bodyFont = parseFontFamily(fonts.body || fonts.secondary || fonts.primary);

  return {
    colors: colorTokens,
    typography: {
      fontFamilies: {
        heading: headingFont,
        body: bodyFont,
        mono: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      },
      fontSizes: {
        xs: '0.75rem',
        sm: '0.875rem',
        base: '1rem',
        lg: '1.125rem',
        xl: '1.25rem',
        '2xl': '1.5rem',
        '3xl': '1.875rem',
        '4xl': '2.25rem',
        '5xl': '3rem',
        '6xl': '3.75rem',
      },
      fontWeights: {
        thin: 100,
        extralight: 200,
        light: 300,
        normal: 400,
        medium: 500,
        semibold: 600,
        bold: 700,
        extrabold: 800,
        black: 900,
      },
      lineHeights: {
        none: '1',
        tight: '1.25',
        snug: '1.375',
        normal: '1.5',
        relaxed: '1.625',
        loose: '2',
      },
    },
    spacing: {
      px: '1px',
      '0': '0',
      '0.5': '0.125rem',
      '1': '0.25rem',
      '1.5': '0.375rem',
      '2': '0.5rem',
      '2.5': '0.625rem',
      '3': '0.75rem',
      '3.5': '0.875rem',
      '4': '1rem',
      '5': '1.25rem',
      '6': '1.5rem',
      '7': '1.75rem',
      '8': '2rem',
      '9': '2.25rem',
      '10': '2.5rem',
      '12': '3rem',
      '14': '3.5rem',
      '16': '4rem',
      '20': '5rem',
      '24': '6rem',
      '28': '7rem',
      '32': '8rem',
      '36': '9rem',
      '40': '10rem',
      '48': '12rem',
      '56': '14rem',
      '64': '16rem',
    },
    borderRadius: {
      none: '0',
      sm: '0.125rem',
      DEFAULT: '0.25rem',
      md: '0.375rem',
      lg: '0.5rem',
      xl: '0.75rem',
      '2xl': '1rem',
      '3xl': '1.5rem',
      full: '9999px',
    },
    shadows: {
      sm: '0 1px 2px 0 rgb(0 0 0 / 0.05)',
      DEFAULT: '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
      md: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
      lg: '0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1)',
      xl: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      '2xl': '0 25px 50px -12px rgb(0 0 0 / 0.25)',
      inner: 'inset 0 2px 4px 0 rgb(0 0 0 / 0.05)',
      none: 'none',
    },
  };
}

// Generate Tailwind config from design tokens
function generateTailwindConfig(tokens: DesignTokens): TailwindConfig {
  const colors: Record<string, string | Record<string, string>> = {};

  // Add color palettes
  Object.entries(tokens.colors).forEach(([key, value]) => {
    if (typeof value === 'string') {
      colors[key] = value;
    } else if (value && typeof value === 'object') {
      colors[key] = value as unknown as Record<string, string>;
    }
  });

  return {
    theme: {
      extend: {
        colors,
        fontFamily: {
          heading: tokens.typography.fontFamilies.heading.split(', '),
          body: tokens.typography.fontFamilies.body.split(', '),
          mono: tokens.typography.fontFamilies.mono?.split(', ') || ['monospace'],
        },
        fontSize: tokens.typography.fontSizes,
        borderRadius: tokens.borderRadius,
        boxShadow: tokens.shadows,
      },
    },
  };
}

// Generate CSS variables from design tokens
function generateCSSVariables(tokens: DesignTokens): string {
  const lines: string[] = [':root {'];

  // Colors
  Object.entries(tokens.colors).forEach(([colorName, colorValue]) => {
    if (typeof colorValue === 'string') {
      lines.push(`  --color-${colorName}: ${colorValue};`);
    } else if (colorValue && typeof colorValue === 'object') {
      Object.entries(colorValue).forEach(([shade, hex]) => {
        lines.push(`  --color-${colorName}-${shade}: ${hex};`);
      });
    }
  });

  lines.push('');

  // Typography
  lines.push(`  --font-heading: ${tokens.typography.fontFamilies.heading};`);
  lines.push(`  --font-body: ${tokens.typography.fontFamilies.body};`);
  lines.push(`  --font-mono: ${tokens.typography.fontFamilies.mono};`);

  lines.push('');

  // Font sizes
  Object.entries(tokens.typography.fontSizes).forEach(([key, value]) => {
    lines.push(`  --text-${key}: ${value};`);
  });

  lines.push('');

  // Spacing
  Object.entries(tokens.spacing).forEach(([key, value]) => {
    const safeName = key.replace('.', '_');
    lines.push(`  --spacing-${safeName}: ${value};`);
  });

  lines.push('');

  // Border radius
  Object.entries(tokens.borderRadius).forEach(([key, value]) => {
    const name = key === 'DEFAULT' ? 'default' : key;
    lines.push(`  --radius-${name}: ${value};`);
  });

  lines.push('');

  // Shadows
  Object.entries(tokens.shadows).forEach(([key, value]) => {
    const name = key === 'DEFAULT' ? 'default' : key;
    lines.push(`  --shadow-${name}: ${value};`);
  });

  lines.push('}');

  return lines.join('\n');
}

// Fallback: Scrape and analyze website directly if Firecrawl unavailable
async function fallbackExtractStyles(url: string): Promise<FirecrawlBrandingData> {
  console.log('[extract-brand-styles] Using fallback style extraction for:', url);

  try {
    // Fetch the webpage
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = await response.text();

    // Extract colors using regex patterns
    const colorPatterns = {
      hex: /#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})\b/g,
      rgb: /rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi,
      rgba: /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*[\d.]+\s*\)/gi,
    };

    // Find all hex colors
    const hexColors = html.match(colorPatterns.hex) || [];

    // Count color occurrences
    const colorCounts: Record<string, number> = {};
    hexColors.forEach((color) => {
      const normalized = color.toUpperCase();
      // Skip very common non-brand colors
      if (['#FFFFFF', '#FFF', '#000000', '#000', '#333333', '#333'].includes(normalized)) {
        return;
      }
      colorCounts[normalized] = (colorCounts[normalized] || 0) + 1;
    });

    // Sort by frequency
    const sortedColors = Object.entries(colorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([color]) => color);

    // Extract font families
    const fontFamilyMatch = html.match(/font-family:\s*([^;}]+)/gi) || [];
    const fonts: string[] = [];
    fontFamilyMatch.forEach((match) => {
      const font = match.replace(/font-family:\s*/i, '').trim();
      if (!fonts.includes(font) && !font.includes('inherit') && !font.includes('initial')) {
        fonts.push(font);
      }
    });

    // Extract title
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Extract favicon
    const faviconMatch = html.match(/<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i);
    let favicon = faviconMatch ? faviconMatch[1].trim() : '';

    // Make favicon URL absolute
    if (favicon && !favicon.startsWith('http')) {
      const urlObj = new URL(url);
      favicon = new URL(favicon, urlObj.origin).href;
    }

    // Extract logo
    const logoMatch = html.match(/<img[^>]*(?:class|id)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/i);
    let logo = logoMatch ? logoMatch[1].trim() : '';

    // Make logo URL absolute
    if (logo && !logo.startsWith('http')) {
      const urlObj = new URL(url);
      logo = new URL(logo, urlObj.origin).href;
    }

    return {
      name: title || new URL(url).hostname,
      logo: logo || undefined,
      favicon: favicon || undefined,
      colors: {
        primary: sortedColors[0] || '#3B82F6',
        secondary: sortedColors[1] || undefined,
        accent: sortedColors[2] || undefined,
        background: '#FFFFFF',
        text: '#1F2937',
      },
      fonts: {
        primary: fonts[0] || 'system-ui, sans-serif',
        secondary: fonts[1] || undefined,
      },
      metadata: {
        title,
        description,
      },
    };
  } catch (error) {
    console.error('[extract-brand-styles] Fallback extraction failed:', error);
    throw error;
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as { url?: string; prompt?: string };
    const { url, prompt } = body;

    if (!url) {
      return json({ error: 'URL is required' }, { status: 400 });
    }

    // Validate URL format
    let validatedUrl: URL;
    try {
      validatedUrl = new URL(url);
      if (!['http:', 'https:'].includes(validatedUrl.protocol)) {
        return json({ error: 'Invalid URL protocol. Must be http or https.' }, { status: 400 });
      }
    } catch {
      return json({ error: 'Invalid URL format' }, { status: 400 });
    }

    console.log('[extract-brand-styles] Extracting brand styles for:', url);
    if (prompt) {
      console.log('[extract-brand-styles] User prompt:', prompt);
    }

    let brandingData: FirecrawlBrandingData;

    // Try Firecrawl API first
    const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;

    if (FIRECRAWL_API_KEY) {
      console.log('[extract-brand-styles] Calling Firecrawl branding API');

      try {
        const firecrawlResponse = await fetch('https://api.firecrawl.dev/v2/scrape', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: url,
            formats: ['branding'],
          }),
        });

        if (!firecrawlResponse.ok) {
          const errorText = await firecrawlResponse.text();
          console.error('[extract-brand-styles] Firecrawl API error:', firecrawlResponse.status, errorText);
          throw new Error(`Firecrawl API returned ${firecrawlResponse.status}`);
        }

        const firecrawlData = (await firecrawlResponse.json()) as FirecrawlResponse;
        console.log('[extract-brand-styles] Firecrawl response received successfully');

        brandingData = firecrawlData.data?.branding || firecrawlData.branding || {};

        if (!brandingData || Object.keys(brandingData).length === 0) {
          console.log('[extract-brand-styles] No branding data from Firecrawl, using fallback');
          brandingData = await fallbackExtractStyles(url);
        }
      } catch (firecrawlError) {
        console.error('[extract-brand-styles] Firecrawl failed, using fallback:', firecrawlError);
        brandingData = await fallbackExtractStyles(url);
      }
    } else {
      console.log('[extract-brand-styles] No Firecrawl API key, using fallback extraction');
      brandingData = await fallbackExtractStyles(url);
    }

    // Generate design tokens from branding data
    const designTokens = generateDesignTokens(brandingData);

    // Generate Tailwind config
    const tailwindConfig = generateTailwindConfig(designTokens);

    // Generate CSS variables
    const cssVariables = generateCSSVariables(designTokens);

    console.log('[extract-brand-styles] Successfully extracted brand styles');

    const response: ExtractBrandStylesResponse = {
      success: true,
      url,
      styleName: brandingData.name || validatedUrl.hostname,
      guidelines: brandingData,
      designTokens,
      tailwindConfig,
      cssVariables,
    };

    return json(response);
  } catch (error) {
    console.error('[extract-brand-styles] Error:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to extract brand styles',
      },
      { status: 500 }
    );
  }
}

// GET handler for documentation/health check
export async function loader() {
  return json({
    endpoint: '/api/extract-brand-styles',
    method: 'POST',
    description: 'Extracts brand styles and design tokens from a website URL',
    body: {
      url: 'string (required) - The website URL to extract styles from',
      prompt: 'string (optional) - Additional instructions for style extraction',
    },
    response: {
      success: 'boolean - Whether extraction succeeded',
      url: 'string - The source URL',
      styleName: 'string - Extracted brand/site name',
      guidelines: 'object - Raw branding data (colors, fonts, metadata)',
      designTokens: 'object - Structured design tokens',
      tailwindConfig: 'object - Generated Tailwind configuration',
      cssVariables: 'string - Generated CSS custom properties',
    },
  });
}
