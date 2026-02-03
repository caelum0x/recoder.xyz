import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { dirname, join } from 'path';
import { createRequestHandler } from '@remix-run/express';
import express from 'express';

const __filename = fileURLToPath(import.meta.url);
const __dirnameLocal = dirname(__filename);
dotenv.config({ path: join(__dirnameLocal, '.env') });

console.log('🔧 ENV - DATABASE_URL:', process.env.DATABASE_URL ? 'SET' : 'NOT SET');

const BUILD_DIR = join(__dirnameLocal, 'build');
const app = express();

// Add cross-origin isolation headers for WebContainer support
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
  next();
});

// Serve static files with smart caching
// Files with content hashes (e.g., /assets/index-abc123.js) get long cache
// Non-hashed files get short cache to ensure updates are seen
app.use(express.static(join(BUILD_DIR, 'client'), {
  setHeaders: (res, filePath) => {
    // Check if the file has a content hash in its name
    // Remix/Vite typically creates files like: assets/index-[hash].js, assets/style-[hash].css
    const hasContentHash = /\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|eot|otf)$/i.test(filePath) ||
                           /[-_][a-f0-9]{8,}\.(js|css)$/i.test(filePath) ||
                           filePath.includes('/assets/');

    if (hasContentHash) {
      // Content-hashed files are immutable - cache for 1 year
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (/\.(html|htm)$/i.test(filePath) || filePath.endsWith('/')) {
      // HTML files should always be revalidated
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
    } else if (/\.(png|jpg|jpeg|gif|ico|svg|webp)$/i.test(filePath)) {
      // Images without hashes: cache for 1 day, but revalidate
      res.setHeader('Cache-Control', 'public, max-age=86400, must-revalidate');
    } else {
      // Other files: short cache, must revalidate
      res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
    }
  }
}));

const buildPath = pathToFileURL(join(BUILD_DIR, 'server', 'index.js')).href;

app.use(async (req, res, next) => {
  try {
    const build = await import(buildPath);
    const envContext = {
      DATABASE_URL: process.env.DATABASE_URL,
      GITHUB_TOKEN: process.env.GITHUB_TOKEN,
      MAIN_SITE_URL: process.env.MAIN_SITE_URL,
      RECODER_WEB_URL: process.env.RECODER_WEB_URL,
      JWT_SECRET: process.env.JWT_SECRET,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
      OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    };
    
    return createRequestHandler({
      build,
      getLoadContext() {
        return {
          cloudflare: {
            env: envContext
          }
        };
      }
    })(req, res, next);
  } catch (error) {
    console.error('Error loading build:', error);
    next(error);
  }
});

const port = process.env.PORT || 5173;
app.listen(port, '0.0.0.0', () => {
  console.log('🚀 Server running at http://0.0.0.0:' + port);
});
