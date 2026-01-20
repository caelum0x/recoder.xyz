/**
 * MCP Marketplace API
 * GET /api/mcp/marketplace - Get marketplace catalog
 */

import { json, type LoaderFunctionArgs } from '@remix-run/node';
import {
  getMarketplaceCatalog,
  getFeaturedServers,
  getServersByCategory,
  searchServers,
  getCategoriesWithCounts,
  type MarketplaceCategory,
} from '~/lib/.server/mcp/marketplace-catalog';

export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const category = url.searchParams.get('category') as MarketplaceCategory | null;
  const search = url.searchParams.get('search');
  const featured = url.searchParams.get('featured') === 'true';

  try {
    let servers;

    if (featured) {
      servers = getFeaturedServers();
    } else if (search) {
      servers = searchServers(search);
    } else if (category) {
      servers = getServersByCategory(category);
    } else {
      servers = getMarketplaceCatalog();
    }

    const categories = getCategoriesWithCounts();

    return json({
      success: true,
      servers,
      categories,
      total: servers.length,
    });
  } catch (error) {
    console.error('[MCP Marketplace] Error:', error);
    return json(
      {
        success: false,
        error: 'Failed to load marketplace catalog',
        servers: [],
        categories: [],
        total: 0,
      },
      { status: 500 }
    );
  }
}
