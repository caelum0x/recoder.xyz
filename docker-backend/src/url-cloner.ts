/**
 * URL Cloner - Create exact clones of websites
 * Downloads HTML, CSS, images, fonts, and all assets to create a pixel-perfect replica
 * Runs in docker-backend for full Node.js capabilities
 */

import * as path from 'path';
import * as https from 'https';
import * as http from 'http';

export interface ClonedAsset {
  originalUrl: string;
  localPath: string;
  content: string;
  contentType: string;
}

export interface ClonedWebsite {
  url: string;
  title: string;
  html: string;
  files: Record<string, string>;
  assetCount: number;
}

/**
 * Fetch URL with proper headers and follow redirects
 */
async function fetchWithRedirects(url: string, maxRedirects = 5): Promise<{ body: string; contentType: string }> {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'identity', // Don't use compression for simplicity
        'Cache-Control': 'no-cache',
      },
    };

    const req = protocol.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        const redirectUrl = new URL(res.headers.location, url).href;
        fetchWithRedirects(redirectUrl, maxRedirects - 1)
          .then(resolve)
          .catch(reject);
        return;
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        const contentType = res.headers['content-type'] || 'text/html';
        resolve({ body, contentType });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

/**
 * Fetch binary content (images, fonts)
 */
async function fetchBinary(url: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;

    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    };

    const req = protocol.get(url, options, (res) => {
      // Handle redirects
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, url).href;
        fetchBinary(redirectUrl).then(resolve);
        return;
      }

      if (res.statusCode !== 200) {
        resolve(null);
        return;
      }

      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        const contentType = res.headers['content-type'] || 'application/octet-stream';
        resolve({ buffer, contentType });
      });
      res.on('error', () => resolve(null));
    });

    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => {
      req.destroy();
      resolve(null);
    });
  });
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
  console.log(`[URL Clone] Starting exact clone of: ${url}`);

  // Fetch the main HTML
  const { body: html } = await fetchWithRedirects(url);

  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Cloned Website';

  console.log(`[URL Clone] Page title: ${title}`);

  const files: Record<string, string> = {};
  let assetCount = 0;

  // Process the HTML
  let processedHtml = html;

  // 1. Download and inline all CSS
  processedHtml = await processStylesheets(processedHtml, baseUrl, files, () => assetCount++);

  // 2. Download and embed all images
  processedHtml = await processImages(processedHtml, baseUrl, () => assetCount++);

  // 3. Process Google Fonts
  processedHtml = await processFonts(processedHtml, baseUrl, () => assetCount++);

  // 4. Process background images in inline styles
  processedHtml = await processInlineStyles(processedHtml, baseUrl, () => assetCount++);

  // 5. Fix remaining relative URLs
  processedHtml = fixRelativeUrls(processedHtml, baseUrl);

  // 6. Add base tag
  if (!processedHtml.includes('<base')) {
    processedHtml = processedHtml.replace(/<head([^>]*)>/i, `<head$1>\n<base href="${baseUrl.origin}/">`);
  }

  // Create index.html
  files['index.html'] = processedHtml;

  // Create package.json
  files['package.json'] = JSON.stringify({
    name: sanitizeFilename(title),
    version: '1.0.0',
    scripts: {
      dev: 'npx serve .',
      start: 'npx serve .',
    },
  }, null, 2);

  console.log(`[URL Clone] Clone complete. Files: ${Object.keys(files).length}, Assets embedded: ${assetCount}`);

  return {
    url,
    title,
    html: processedHtml,
    files,
    assetCount,
  };
}

/**
 * Process and download all stylesheets
 */
async function processStylesheets(
  html: string,
  baseUrl: URL,
  files: Record<string, string>,
  onAsset: () => void
): Promise<string> {
  // Find all <link rel="stylesheet"> tags
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*>/gi;
  const links = html.match(linkRegex) || [];

  for (const link of links) {
    const hrefMatch = link.match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;

    const cssUrl = resolveUrl(baseUrl, hrefMatch[1]);
    console.log(`[URL Clone] Downloading CSS: ${cssUrl.slice(0, 80)}...`);

    try {
      const { body: cssContent } = await fetchWithRedirects(cssUrl);
      onAsset();

      // Process url() references in CSS and inline them
      const processedCss = await processCssUrls(cssContent, new URL(cssUrl), onAsset);

      // Inline the CSS
      html = html.replace(link, `<style>\n/* Source: ${cssUrl} */\n${processedCss}\n</style>`);
    } catch (error) {
      console.warn(`[URL Clone] Failed to fetch CSS: ${cssUrl}`);
    }
  }

  // Process inline <style> tags
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  let styleMatch;
  const styleReplacements: { original: string; replacement: string }[] = [];

  while ((styleMatch = styleRegex.exec(html)) !== null) {
    const originalStyle = styleMatch[0];
    let cssContent = styleMatch[1];

    // Process url() references
    const processedCss = await processCssUrls(cssContent, baseUrl, onAsset);
    if (processedCss !== cssContent) {
      styleReplacements.push({
        original: originalStyle,
        replacement: `<style>${processedCss}</style>`,
      });
    }
  }

  for (const { original, replacement } of styleReplacements) {
    html = html.replace(original, replacement);
  }

  return html;
}

/**
 * Process url() references in CSS content - embed as data URLs
 */
async function processCssUrls(
  css: string,
  cssBaseUrl: URL,
  onAsset: () => void
): Promise<string> {
  const urlRegex = /url\(['"]?([^'")\s]+)['"]?\)/gi;
  const matches: { full: string; url: string }[] = [];
  let match;

  while ((match = urlRegex.exec(css)) !== null) {
    matches.push({ full: match[0], url: match[1] });
  }

  for (const { full, url } of matches) {
    // Skip data URLs
    if (url.startsWith('data:')) continue;

    const fullUrl = resolveUrl(cssBaseUrl, url);

    try {
      const result = await fetchBinary(fullUrl);
      if (result && result.buffer.length < 500000) { // Max 500KB per asset
        const base64 = result.buffer.toString('base64');
        const dataUrl = `data:${result.contentType};base64,${base64}`;
        css = css.split(full).join(`url("${dataUrl}")`);
        onAsset();
      }
    } catch (error) {
      // Keep original URL if fetch fails
    }
  }

  return css;
}

/**
 * Process and embed all images
 */
async function processImages(
  html: string,
  baseUrl: URL,
  onAsset: () => void
): Promise<string> {
  // Find all img src
  const imgRegex = /<img([^>]*)src=["']([^"']+)["']([^>]*)>/gi;
  const matches: { full: string; before: string; url: string; after: string }[] = [];
  let match;

  while ((match = imgRegex.exec(html)) !== null) {
    matches.push({
      full: match[0],
      before: match[1],
      url: match[2],
      after: match[3],
    });
  }

  for (const { full, before, url, after } of matches) {
    // Skip data URLs
    if (url.startsWith('data:')) continue;

    const fullUrl = resolveUrl(baseUrl, url);

    try {
      const result = await fetchBinary(fullUrl);
      if (result && result.buffer.length < 2000000) { // Max 2MB per image
        const base64 = result.buffer.toString('base64');
        const dataUrl = `data:${result.contentType};base64,${base64}`;
        const newTag = `<img${before}src="${dataUrl}"${after}>`;
        html = html.replace(full, newTag);
        onAsset();
        console.log(`[URL Clone] Embedded image: ${url.slice(0, 50)}...`);
      }
    } catch (error) {
      // Keep original URL if fetch fails
    }
  }

  // Remove srcset attributes (they complicate things)
  html = html.replace(/\s+srcset=["'][^"']*["']/gi, '');

  return html;
}

/**
 * Process Google Fonts
 */
async function processFonts(
  html: string,
  baseUrl: URL,
  onAsset: () => void
): Promise<string> {
  // Find Google Fonts links
  const googleFontsRegex = /<link[^>]*href=["'](https:\/\/fonts\.googleapis\.com[^"']+)["'][^>]*>/gi;
  let match;

  while ((match = googleFontsRegex.exec(html)) !== null) {
    const fontUrl = match[1];

    try {
      const { body: fontCss } = await fetchWithRedirects(fontUrl);
      onAsset();

      // Embed font files referenced in the CSS
      const processedFontCss = await processCssUrls(fontCss, new URL(fontUrl), onAsset);

      // Replace the link with inline style
      html = html.replace(match[0], `<style>\n/* Google Fonts */\n${processedFontCss}\n</style>`);
      console.log(`[URL Clone] Embedded Google Fonts`);
    } catch (error) {
      console.warn(`[URL Clone] Failed to fetch fonts: ${fontUrl}`);
    }
  }

  return html;
}

/**
 * Process inline style attributes with url()
 */
async function processInlineStyles(
  html: string,
  baseUrl: URL,
  onAsset: () => void
): Promise<string> {
  const styleAttrRegex = /style=["']([^"']*url\([^)]+\)[^"']*)["']/gi;
  const matches: { full: string; content: string }[] = [];
  let match;

  while ((match = styleAttrRegex.exec(html)) !== null) {
    matches.push({ full: match[0], content: match[1] });
  }

  for (const { full, content } of matches) {
    const processedContent = await processCssUrls(content, baseUrl, onAsset);
    if (processedContent !== content) {
      html = html.replace(full, `style="${processedContent}"`);
    }
  }

  return html;
}

/**
 * Fix remaining relative URLs
 */
function fixRelativeUrls(html: string, baseUrl: URL): string {
  // Fix href and src that are relative
  return html.replace(
    /(href|src)=["'](?!data:|http:|https:|\/\/|#|javascript:|mailto:)([^"']+)["']/gi,
    (match, attr, url) => {
      const fullUrl = resolveUrl(baseUrl, url);
      return `${attr}="${fullUrl}"`;
    }
  );
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
 * Sanitize a string for use as a filename
 */
function sanitizeFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50) || 'cloned-website';
}
