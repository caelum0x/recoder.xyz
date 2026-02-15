/**
 * Starters API
 * Load and import local starter templates
 * Uses pre-bundled JSON for Cloudflare Workers compatibility
 */

import { json, type ActionFunctionArgs, type LoaderFunctionArgs } from '@remix-run/cloudflare';
// Import the bundle directly - works in Cloudflare Workers
import startersBundleData from '~/lib/.server/llm/starters-bundle.json';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Starters');

// Simple path joining utility
function joinPath(...parts: string[]): string {
  return parts
    .join('/')
    .replace(/\/+/g, '/')
    .replace(/\\/g, '/');
}

/**
 * GET /api/starters - List all starters
 * GET /api/starters?id=angular - Get specific starter files
 */
export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const url = new URL(request.url);
    const starterId = url.searchParams.get('id');

    if (starterId) {
      // Get specific starter files from bundle
      const starter = (startersBundleData as any)[starterId];
      if (!starter) {
        return json(
          {
            success: false,
            error: `Starter "${starterId}" not found`,
          },
          { status: 404 }
        );
      }

      return json({
        success: true,
        data: {
          id: starterId,
          files: starter.files,
          fileCount: starter.metadata?.fileCount || Object.keys(starter.files).length,
        },
      });
    }

    // List all available starters
    const starters = listStarters();
    return json({
      success: true,
      data: starters,
    });
  } catch (error) {
    logger.error('Starters API error:', error);
    return json(
      {
        success: false,
        error: 'Failed to load starters',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/starters - Import starter to project
 */
export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = await request.json() as { starterId?: string; action?: string };
    const { starterId, action } = body;

    if (action === 'import' && starterId) {
      const starter = (startersBundleData as any)[starterId];
      if (!starter) {
        return json(
          {
            success: false,
            error: `Starter "${starterId}" not found`,
          },
          { status: 404 }
        );
      }

      return json({
        success: true,
        data: {
          starterId,
          files: starter.files,
          fileCount: starter.metadata?.fileCount || Object.keys(starter.files).length,
          message: `Successfully loaded ${Object.keys(starter.files).length} files from ${starterId} starter`,
        },
      });
    }

    return json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    logger.error('Starters import error:', error);
    return json(
      {
        success: false,
        error: 'Import failed',
      },
      { status: 500 }
    );
  }
}

/**
 * List all available starters from bundle
 */
function listStarters() {
  const bundle = startersBundleData as any;
  const starters = Object.keys(bundle).map((starterId) => {
    const starter = bundle[starterId];
    const packageJson = starter.packageJson;

    let name = starterId;
    let description = '';
    let framework = 'unknown';

    if (packageJson) {
      name = packageJson.name || starterId;
      description = packageJson.description || '';

      // Detect framework from dependencies
      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (deps.react || deps['react-dom']) framework = 'react';
      if (deps.next) framework = 'nextjs';
      if (deps.vue) framework = 'vue';
      if (deps['@angular/core']) framework = 'angular';
      if (deps.astro) framework = 'astro';
      if (deps.qwik) framework = 'qwik';
      if (deps.expo) framework = 'expo';
      if (deps.express) framework = 'express';
    }

    return {
      id: starterId,
      name,
      description,
      framework,
      path: starterId,
    };
  });

  return starters;
}

