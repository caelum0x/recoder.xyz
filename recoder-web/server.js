import { createRequestHandler } from '@remix-run/express';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BUILD_DIR = join(__dirname, 'build');

const app = express();

// Serve static files from build/client
app.use(express.static(join(BUILD_DIR, 'client'), {
  immutable: true,
  maxAge: '1y',
}));

// Load build dynamically
const buildPath = pathToFileURL(join(BUILD_DIR, 'server', 'index.js')).href;

// Handle all other requests with Remix (Express 5 uses {*path} instead of *)
app.use(async (req, res, next) => {
  try {
    const build = await import(buildPath);
    return createRequestHandler({
      build,
      getLoadContext() {
        return {
          cloudflare: {
            env: {
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
            }
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
  console.log(`🚀 Server running at http://0.0.0.0:${port}`);
});
