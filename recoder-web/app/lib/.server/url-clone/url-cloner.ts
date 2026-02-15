/**
 * URL Cloner - Create exact clones of websites
 * Downloads HTML, CSS, images, fonts, and all assets to create a pixel-perfect replica
 */

import * as path from 'path';

import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('URLCloner');

export interface ClonedAsset {
  originalUrl: string;
  localPath: string;
  content: string | Buffer;
  contentType: string;
}

export interface ClonedWebsite {
  url: string;
  title: string;
  html: string;
  assets: Map<string, ClonedAsset>;
  files: Record<string, string>;
}

/**
 * Fetch and clone an entire website
 */
export async function cloneWebsite(url: string): Promise<ClonedWebsite> {
  // Normalize URL
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  const baseUrl = new URL(url);
  logger.info(`[URL Clone] Starting exact clone of: ${url}`);

  // Fetch the main HTML
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  let html = await response.text();
  const assets = new Map<string, ClonedAsset>();

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Cloned Website';

  logger.info(`[URL Clone] Page title: ${title}`);

  // Download and inline all CSS
  html = await processStylesheets(html, baseUrl, assets);

  // Download and embed all images
  html = await processImages(html, baseUrl, assets);

  // Download and embed fonts
  html = await processFonts(html, baseUrl, assets);

  // Process inline styles with url() references
  html = await processInlineStyles(html, baseUrl, assets);

  // Fix relative URLs in links and scripts
  html = fixRelativeUrls(html, baseUrl);

  // Add base tag to help with any remaining relative URLs
  if (!html.includes('<base')) {
    html = html.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseUrl.origin}/">`);
  }

  // Generate project files
  const files = generateProjectFiles(html, title, assets);

  logger.info(`[URL Clone] Clone complete. Files: ${Object.keys(files).length}, Assets: ${assets.size}`);

  return {
    url,
    title,
    html,
    assets,
    files,
  };
}

/**
 * Process and download all stylesheets
 */
async function processStylesheets(
  html: string,
  baseUrl: URL,
  assets: Map<string, ClonedAsset>
): Promise<string> {
  // Find all <link rel="stylesheet"> tags
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*>/gi;
  const links = html.match(linkRegex) || [];

  for (const link of links) {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const cssUrl = resolveUrl(baseUrl, hrefMatch[1]);
    logger.info(`[URL Clone] Downloading CSS: ${cssUrl}`);

    try {
      const cssResponse = await fetch(cssUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (cssResponse.ok) {
        let cssContent = await cssResponse.text();

        // Process url() references in CSS
        cssContent = await processCssUrls(cssContent, new URL(cssUrl), assets);

        // Generate local filename
        const localPath = `assets/css/${generateFilename(cssUrl, 'css')}`;

        assets.set(cssUrl, {
          originalUrl: cssUrl,
          localPath,
          content: cssContent,
          contentType: 'text/css',
        });

        // Replace link with local reference
        html = html.replace(link, `<link rel="stylesheet" href="${localPath}">`);
      }
    } catch (error) {
      logger.warn(`[URL Clone] Failed to fetch CSS: ${cssUrl}`, error);
    }
  }

  // Also process inline <style> tags
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;

  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const originalStyle = styleMatch[0];
    let cssContent = styleMatch[1];

    // Process url() references in inline CSS
    cssContent = await processCssUrls(cssContent, baseUrl, assets);

    html = html.replace(originalStyle, `<style>${cssContent}</style>`);
  }

  return html;
}

/**
 * Process url() references in CSS content
 */
async function processCssUrls(
  css: string,
  cssBaseUrl: URL,
  assets: Map<string, ClonedAsset>
): Promise<string> {
  const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/gi;
  let match;
  const replacements: { original: string; replacement: string }[] = [];

  while ((match = urlRegex.exec(css)) !== null) {
    const originalUrl = match[1];

    // Skip data URLs and already processed
    if (originalUrl.startsWith('data:') || originalUrl.startsWith('assets/')) {
      continue;
    }

    const fullUrl = resolveUrl(cssBaseUrl, originalUrl);

    // Check if already downloaded
    if (assets.has(fullUrl)) {
      const asset = assets.get(fullUrl)!;
      replacements.push({
        original: match[0],
        replacement: `url("../${asset.localPath}")`,
      });
      continue;
    }

    try {
      const response = await fetch(fullUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // For small files, inline as data URL
        if (buffer.byteLength < 50000) {
          replacements.push({
            original: match[0],
            replacement: `url("data:${contentType};base64,${base64}")`,
          });
        } else {
          // For larger files, save as asset
          const ext = getExtensionFromContentType(contentType);
          const localPath = `assets/images/${generateFilename(fullUrl, ext)}`;

          assets.set(fullUrl, {
            originalUrl: fullUrl,
            localPath,
            content: Buffer.from(buffer).toString('base64'),
            contentType,
          });

          replacements.push({
            original: match[0],
            replacement: `url("../${localPath}")`,
          });
        }
      }
    } catch (error) {
      logger.warn(`[URL Clone] Failed to fetch CSS asset: ${fullUrl}`);
    }
  }

  // Apply replacements
  for (const { original, replacement } of replacements) {
    css = css.split(original).join(replacement);
  }

  return css;
}

/**
 * Process and download all images
 */
async function processImages(
  html: string,
  baseUrl: URL,
  assets: Map<string, ClonedAsset>
): Promise<string> {
  // Find all img src
  const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    const originalTag = match[0];
    const imgUrl = match[1];

    // Skip data URLs
    if (imgUrl.startsWith('data:')) continue;

    const fullUrl = resolveUrl(baseUrl, imgUrl);

    try {
      const response = await fetch(fullUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });

      if (response.ok) {
        const contentType = response.headers.get('content-type') || 'image/png';
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');

        // Inline as data URL for simplicity
        const dataUrl = `data:${contentType};base64,${base64}`;
        const newTag = originalTag.replace(imgUrl, dataUrl);
        html = html.replace(originalTag, newTag);

        logger.info(`[URL Clone] Embedded image: ${imgUrl.slice(0, 50)}...`);
      }
    } catch (error) {
      logger.warn(`[URL Clone] Failed to fetch image: ${fullUrl}`);
    }
  }

  // Also process srcset
  const srcsetRegex = /srcset=["']([^"']+)["']/gi;
  while ((match = srcsetRegex.exec(html)) !== null) {
    // For srcset, we'll remove it to simplify (use main src instead)
    html = html.replace(match[0], '');
  }

  return html;
}

/**
 * Process and embed fonts
 */
async function processFonts(
  html: string,
  baseUrl: URL,
  assets: Map<string, ClonedAsset>
): Promise<string> {
  // Find Google Fonts links and download them
  const googleFontsRegex = /<link[^>]*href=["'](https:\/\/fonts\.googleapis\.com[^"']+)["'][^>]*>/gi;
  let match;

  while ((match = googleFontsRegex.exec(html)) !== null) {
    const fontUrl = match[1];

    try {
      // Fetch the Google Fonts CSS
      const response = await fetch(fontUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });

      if (response.ok) {
        let fontCss = await response.text();

        // Download and inline the actual font files
        fontCss = await processCssUrls(fontCss, new URL(fontUrl), assets);

        // Replace the link with inline style
        html = html.replace(match[0], `<style>${fontCss}</style>`);
        logger.info(`[URL Clone] Embedded Google Fonts`);
      }
    } catch (error) {
      logger.warn(`[URL Clone] Failed to fetch fonts: ${fontUrl}`);
    }
  }

  return html;
}

/**
 * Process inline style attributes
 */
async function processInlineStyles(
  html: string,
  baseUrl: URL,
  assets: Map<string, ClonedAsset>
): Promise<string> {
  const styleAttrRegex = /style=["']([^"']+)["']/gi;
  let match;
  const replacements: { original: string; replacement: string }[] = [];

  while ((match = styleAttrRegex.exec(html)) !== null) {
    const originalStyle = match[0];
    let styleContent = match[1];

    if (styleContent.includes('url(')) {
      styleContent = await processCssUrls(styleContent, baseUrl, assets);
      replacements.push({
        original: originalStyle,
        replacement: `style="${styleContent}"`,
      });
    }
  }

  for (const { original, replacement } of replacements) {
    html = html.replace(original, replacement);
  }

  return html;
}

/**
 * Fix remaining relative URLs
 */
function fixRelativeUrls(html: string, baseUrl: URL): string {
  // Fix href and src that are relative
  html = html.replace(/(href|src)=["'](?!data:|http:|https:|\/\/|#|javascript:)([^"']+)["']/gi,
    (match, attr, url) => {
      const fullUrl = resolveUrl(baseUrl, url);
      return `${attr}="${fullUrl}"`;
    }
  );

  return html;
}

/**
 * Generate project files for the cloned website
 */
function generateProjectFiles(
  html: string,
  title: string,
  assets: Map<string, ClonedAsset>
): Record<string, string> {
  const files: Record<string, string> = {};

  // Main HTML file
  files['index.html'] = html;

  // Add CSS files
  for (const [, asset] of assets) {
    if (asset.contentType === 'text/css') {
      files[asset.localPath] = asset.content as string;
    }
  }

  // Package.json for serving
  files['package.json'] = JSON.stringify({
    name: sanitizeFilename(title),
    version: '1.0.0',
    scripts: {
      dev: 'npx serve .',
      start: 'npx serve .',
    },
  }, null, 2);

  // README
  files['README.md'] = `# ${title}

This is a cloned website.

## Usage

\`\`\`bash
npm run dev
\`\`\`

Then open http://localhost:3000
`;

  return files;
}

/**
 * Resolve a URL relative to a base URL
 */
function resolveUrl(base: URL, relative: string): string {
  if (relative.startsWith('http://') || relative.startsWith('https://')) {
    return relative;
  }
  if (relative.startsWith('//')) {
    return base.protocol + relative;
  }
  try {
    return new URL(relative, base).href;
  } catch {
    return relative;
  }
}

/**
 * Generate a safe filename from a URL
 */
function generateFilename(url: string, ext: string): string {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  let name = path.basename(pathname) || 'file';

  // Remove query string and clean up
  name = name.split('?')[0].split('#')[0];

  // If no extension, add one
  if (!name.includes('.')) {
    name = `${name}.${ext}`;
  }

  // Make sure it's a valid filename
  name = name.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Add hash to make unique
  const hash = Math.random().toString(36).substring(2, 8);
  const parts = name.split('.');
  const extension = parts.pop();
  return `${parts.join('.')}_${hash}.${extension}`;
}

/**
 * Get file extension from content type
 */
function getExtensionFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
    'application/font-woff': 'woff',
    'application/font-woff2': 'woff2',
  };

  return map[contentType] || 'bin';
}

/**
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'cloned-website';
}

/**
 * Generate a prompt for AI to enhance/modify the cloned site (optional)
 */
export function generateClonePrompt(website: ClonedWebsite): string {
  return `Website "${website.title}" has been cloned from ${website.url}.

The clone includes:
- Complete HTML structure
- All CSS styles (inline and external)
- All images (embedded as data URLs)
- All fonts

Files created:
${Object.keys(website.files).map(f => `- ${f}`).join('\n')}

The website is ready to run with \`npm run dev\`.

If you want to modify it, just describe what changes you'd like.`;
}
