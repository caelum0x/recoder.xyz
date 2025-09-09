import { PWAConfig, PWAManifest } from '../types';

export function generateManifest(config: PWAConfig): PWAManifest {
  return {
    name: config.name,
    short_name: config.shortName,
    description: config.description,
    start_url: config.startUrl,
    display: config.display,
    orientation: config.orientation,
    theme_color: config.themeColor,
    background_color: config.backgroundColor,
    scope: config.scope,
    icons: config.icons.map(icon => ({
      src: icon.src,
      sizes: icon.sizes,
      type: icon.type,
      purpose: icon.purpose || 'any'
    })),
    categories: ['productivity', 'utilities'],
    lang: 'en',
    dir: 'ltr',
    prefer_related_applications: false,
    
    // Add shortcuts if install prompt is enabled
    ...(config.features.installPrompt && {
      shortcuts: [
        {
          name: "Home",
          short_name: "Home",
          description: "Go to the home page",
          url: config.startUrl,
          icons: config.icons.slice(0, 1)
        }
      ]
    }),
    
    // Add file handlers if file system access is enabled
    ...(config.features.fileSystemAccess && {
      file_handlers: [
        {
          action: "/",
          accept: {
            "text/plain": [".txt"],
            "application/json": [".json"],
            "text/html": [".html", ".htm"],
            "text/css": [".css"],
            "application/javascript": [".js"],
            "text/markdown": [".md", ".markdown"]
          },
          icons: config.icons.slice(0, 1),
          launch_type: "single-client"
        }
      ]
    }),
    
    // Add protocol handlers for web share
    ...(config.features.webShare && {
      protocol_handlers: [
        {
          protocol: "web+share",
          url: "/share?url=%s"
        }
      ]
    }),
    
    // Enhanced launch handler
    launch_handler: {
      client_mode: "focus-existing"
    },
    
    // Add screenshots for app stores
    screenshots: [
      {
        src: "/screenshots/desktop-1.png",
        sizes: "1280x720",
        type: "image/png",
        platform: "wide",
        label: "Desktop view of the application"
      },
      {
        src: "/screenshots/mobile-1.png", 
        sizes: "390x844",
        type: "image/png",
        platform: "narrow",
        label: "Mobile view of the application"
      }
    ]
  };
}

export function validateManifest(manifest: PWAManifest): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Required fields
  if (!manifest.name) errors.push('name is required');
  if (!manifest.short_name) errors.push('short_name is required');
  if (!manifest.start_url) errors.push('start_url is required');
  if (!manifest.display) errors.push('display is required');
  
  // Icon validation
  if (!manifest.icons || manifest.icons.length === 0) {
    errors.push('At least one icon is required');
  } else {
    manifest.icons.forEach((icon, index) => {
      if (!icon.src) errors.push(`Icon ${index + 1}: src is required`);
      if (!icon.sizes) errors.push(`Icon ${index + 1}: sizes is required`);
      if (!icon.type) errors.push(`Icon ${index + 1}: type is required`);
    });
  }
  
  // Short name length
  if (manifest.short_name && manifest.short_name.length > 12) {
    errors.push('short_name should be 12 characters or less');
  }
  
  // Start URL validation
  if (manifest.start_url && !manifest.start_url.startsWith('/') && !manifest.start_url.startsWith('http')) {
    errors.push('start_url should be a relative or absolute URL');
  }
  
  // Display mode validation
  const validDisplayModes = ['fullscreen', 'standalone', 'minimal-ui', 'browser'];
  if (manifest.display && !validDisplayModes.includes(manifest.display)) {
    errors.push(`display must be one of: ${validDisplayModes.join(', ')}`);
  }
  
  // Orientation validation
  const validOrientations = ['any', 'natural', 'landscape', 'portrait', 'portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary'];
  if (manifest.orientation && !validOrientations.includes(manifest.orientation)) {
    errors.push(`orientation must be one of: ${validOrientations.join(', ')}`);
  }
  
  // Color validation
  const colorRegex = /^#[0-9A-F]{6}$/i;
  if (manifest.theme_color && !colorRegex.test(manifest.theme_color)) {
    errors.push('theme_color must be a valid hex color (e.g., #000000)');
  }
  if (manifest.background_color && !colorRegex.test(manifest.background_color)) {
    errors.push('background_color must be a valid hex color (e.g., #ffffff)');
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

export function generateManifestMeta(manifest: PWAManifest): string {
  return `
<!-- Web App Manifest -->
<link rel="manifest" href="/manifest.json">

<!-- Primary Meta Tags -->
<meta name="title" content="${manifest.name}">
<meta name="description" content="${manifest.description}">

<!-- PWA Meta Tags -->
<meta name="theme-color" content="${manifest.theme_color}">
<meta name="background-color" content="${manifest.background_color}">
<meta name="display" content="${manifest.display}">
<meta name="orientation" content="${manifest.orientation}">

<!-- iOS Meta Tags -->
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="apple-mobile-web-app-title" content="${manifest.short_name}">
${manifest.icons.map(icon => 
  `<link rel="apple-touch-icon" sizes="${icon.sizes}" href="${icon.src}">`
).join('\n')}

<!-- Android Meta Tags -->
<meta name="mobile-web-app-capable" content="yes">
<meta name="application-name" content="${manifest.short_name}">

<!-- Windows Meta Tags -->
<meta name="msapplication-TileColor" content="${manifest.theme_color}">
<meta name="msapplication-config" content="/browserconfig.xml">

<!-- Favicon -->
${manifest.icons.length > 0 ? `
<link rel="icon" type="${manifest.icons[0].type}" sizes="${manifest.icons[0].sizes}" href="${manifest.icons[0].src}">
<link rel="shortcut icon" href="${manifest.icons[0].src}">
` : ''}

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website">
<meta property="og:url" content="${manifest.start_url}">
<meta property="og:title" content="${manifest.name}">
<meta property="og:description" content="${manifest.description}">
${manifest.icons.length > 0 ? `<meta property="og:image" content="${manifest.icons[0].src}">` : ''}

<!-- Twitter -->
<meta property="twitter:card" content="summary_large_image">
<meta property="twitter:url" content="${manifest.start_url}">
<meta property="twitter:title" content="${manifest.name}">
<meta property="twitter:description" content="${manifest.description}">
${manifest.icons.length > 0 ? `<meta property="twitter:image" content="${manifest.icons[0].src}">` : ''}
`.trim();
}

export function generateBrowserConfig(manifest: PWAManifest): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<browserconfig>
  <msapplication>
    <tile>
      <square70x70logo src="${manifest.icons.find(icon => icon.sizes.includes('70x70'))?.src || manifest.icons[0]?.src}"/>
      <square150x150logo src="${manifest.icons.find(icon => icon.sizes.includes('150x150'))?.src || manifest.icons[0]?.src}"/>
      <square310x310logo src="${manifest.icons.find(icon => icon.sizes.includes('310x310'))?.src || manifest.icons[0]?.src}"/>
      <wide310x150logo src="${manifest.icons.find(icon => icon.sizes.includes('310x150'))?.src || manifest.icons[0]?.src}"/>
      <TileColor>${manifest.theme_color}</TileColor>
    </tile>
  </msapplication>
</browserconfig>`;
}
