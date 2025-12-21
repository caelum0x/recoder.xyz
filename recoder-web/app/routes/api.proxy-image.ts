/**
 * Image proxy endpoint to handle external images with COEP
 * Fetches external images and serves them with proper CORS headers
 */

import { type LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const imageUrl = url.searchParams.get('url');

  if (!imageUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  try {
    // Fetch the external image
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return new Response('Failed to fetch image', { status: response.status });
    }

    // Get the image data and content type
    const imageData = await response.arrayBuffer();
    const contentType = response.headers.get('content-type') || 'image/png';

    // Return with proper CORS headers for COEP
    return new Response(imageData, {
      headers: {
        'Content-Type': contentType,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'public, max-age=31536000',
      },
    });
  } catch (error) {
    console.error('Image proxy error:', error);
    return new Response('Failed to proxy image', { status: 500 });
  }
}
