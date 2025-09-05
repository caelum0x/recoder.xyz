import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, JWTPayload } from '@/lib/auth/jwt';

// 🔍 SERP TRACKING API - Production Ready
// Search Engine Results Page tracking and ranking analysis

interface SERPKeyword {
  keyword: string;
  location?: string;
  language?: string;
  device?: 'desktop' | 'mobile';
}

interface SERPResult {
  position: number;
  url: string;
  title: string;
  description: string;
  domain: string;
  type: 'organic' | 'paid' | 'featured_snippet' | 'local_pack';
  featured_snippet?: {
    type: 'paragraph' | 'list' | 'table';
    content: string;
  };
}

interface SERPAPIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  credits_used?: number;
}

class SERPTrackingClient {
  private apiKey: string;
  private baseURL: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.serpapi.com/search';
  }

  async searchSERP(params: {
    query: string;
    location?: string;
    device?: 'desktop' | 'mobile';
    num?: number;
  }) {
    const searchParams = new URLSearchParams({
      api_key: this.apiKey,
      engine: 'google',
      q: params.query,
      num: (params.num || 10).toString(),
      ...(params.location && { location: params.location }),
      ...(params.device && { device: params.device }),
      output: 'json',
    });

    const response = await fetch(`${this.baseURL}?${searchParams}`);
    
    if (!response.ok) {
      throw new Error(`SERP API error: ${response.status}`);
    }

    return response.json();
  }

  async trackKeywordPositions(keywords: SERPKeyword[]) {
    const results: any[] = [];

    for (const keyword of keywords) {
      try {
        const serpData = await this.searchSERP({
          query: keyword.keyword,
          location: keyword.location,
          device: keyword.device,
        });

        const organicResults = serpData.organic_results || [];
        const keywordResults = {
          keyword: keyword.keyword,
          location: keyword.location || 'global',
          device: keyword.device || 'desktop',
          total_results: serpData.search_information?.total_results || 0,
          results: organicResults.slice(0, 10).map((result: any, index: number) => ({
            position: index + 1,
            title: result.title || '',
            url: result.link || '',
            description: result.snippet || '',
            domain: this.extractDomain(result.link || ''),
            type: 'organic' as const,
          })),
          featured_snippet: serpData.featured_snippet ? {
            type: serpData.featured_snippet.type || 'paragraph',
            content: serpData.featured_snippet.snippet || '',
            url: serpData.featured_snippet.link || '',
          } : null,
          local_pack: serpData.local_results?.slice(0, 3).map((result: any) => ({
            name: result.title,
            address: result.address,
            phone: result.phone,
            rating: result.rating,
          })) || [],
          ads: serpData.ads?.length || 0,
          timestamp: new Date().toISOString(),
        };

        results.push(keywordResults);
        
        // Add delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error tracking keyword ${keyword.keyword}:`, error);
        results.push({
          keyword: keyword.keyword,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  async getDomainRankings(domain: string, keywords: string[]) {
    const results: any[] = [];

    for (const keyword of keywords) {
      try {
        const serpData = await this.searchSERP({ query: keyword });
        const organicResults = serpData.organic_results || [];
        
        const domainPosition = organicResults.findIndex((result: any) => 
          result.link && this.extractDomain(result.link) === domain
        );

        results.push({
          keyword,
          domain,
          position: domainPosition >= 0 ? domainPosition + 1 : null,
          found: domainPosition >= 0,
          url: domainPosition >= 0 ? organicResults[domainPosition].link : null,
          title: domainPosition >= 0 ? organicResults[domainPosition].title : null,
          timestamp: new Date().toISOString(),
        });

        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error checking domain ranking for ${keyword}:`, error);
        results.push({
          keyword,
          domain,
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString(),
        });
      }
    }

    return results;
  }

  async getCompetitorAnalysis(keyword: string, competitors: string[]) {
    try {
      const serpData = await this.searchSERP({ query: keyword });
      const organicResults = serpData.organic_results || [];
      
      const analysis = {
        keyword,
        total_results: serpData.search_information?.total_results || 0,
        competitors: competitors.map(domain => {
          const position = organicResults.findIndex((result: any) => 
            result.link && this.extractDomain(result.link) === domain
          );
          
          return {
            domain,
            position: position >= 0 ? position + 1 : null,
            found: position >= 0,
            url: position >= 0 ? organicResults[position].link : null,
            title: position >= 0 ? organicResults[position].title : null,
          };
        }),
        top_10_domains: organicResults.slice(0, 10).map((result: any, index: number) => ({
          position: index + 1,
          domain: this.extractDomain(result.link || ''),
          url: result.link,
          title: result.title,
        })),
        timestamp: new Date().toISOString(),
      };

      return analysis;
    } catch (error) {
      throw new Error(`Competitor analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractDomain(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }
}

// GET /api/marketing/serp-tracking
export const GET = requireAuth(async (request: NextRequest, user: JWTPayload): Promise<NextResponse> => {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const apiKey = searchParams.get('api_key');

    if (!apiKey) {
      return NextResponse.json<SERPAPIResponse>({ 
        success: false, 
        error: 'SERP API key required' 
      }, { status: 400 });
    }

    const client = new SERPTrackingClient(apiKey);

    switch (action) {
      case 'search': {
        const query = searchParams.get('query');
        const location = searchParams.get('location');
        const device = searchParams.get('device') as 'desktop' | 'mobile' | null;
        const num = parseInt(searchParams.get('num') || '10');

        if (!query) {
          return NextResponse.json<SERPAPIResponse>({ 
            success: false, 
            error: 'Search query required' 
          }, { status: 400 });
        }

        const results = await client.searchSERP({
          query,
          location: location || undefined,
          device: device || undefined,
          num,
        });

        return NextResponse.json<SERPAPIResponse>({ success: true, data: results });
      }

      case 'domain_rankings': {
        const domain = searchParams.get('domain');
        const keywordsParam = searchParams.get('keywords');

        if (!domain || !keywordsParam) {
          return NextResponse.json<SERPAPIResponse>({ 
            success: false, 
            error: 'Domain and keywords required' 
          }, { status: 400 });
        }

        const keywords = keywordsParam.split(',').map(k => k.trim());
        const results = await client.getDomainRankings(domain, keywords);

        return NextResponse.json<SERPAPIResponse>({ success: true, data: results });
      }

      default:
        return NextResponse.json<SERPAPIResponse>({ 
          success: false, 
          error: 'Invalid action' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('SERP tracking error:', error);
    return NextResponse.json<SERPAPIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
});

// POST /api/marketing/serp-tracking
export const POST = requireAuth(async (request: NextRequest, user: JWTPayload): Promise<NextResponse> => {
  try {
    const body = await request.json();
    const { action, api_key, ...params } = body;

    if (!api_key) {
      return NextResponse.json<SERPAPIResponse>({ 
        success: false, 
        error: 'SERP API key required' 
      }, { status: 400 });
    }

    const client = new SERPTrackingClient(api_key);

    switch (action) {
      case 'track_keywords': {
        const { keywords } = params;

        if (!keywords || !Array.isArray(keywords)) {
          return NextResponse.json<SERPAPIResponse>({ 
            success: false, 
            error: 'Keywords array required' 
          }, { status: 400 });
        }

        const results = await client.trackKeywordPositions(keywords);
        return NextResponse.json<SERPAPIResponse>({ success: true, data: results });
      }

      case 'competitor_analysis': {
        const { keyword, competitors } = params;

        if (!keyword || !competitors || !Array.isArray(competitors)) {
          return NextResponse.json<SERPAPIResponse>({ 
            success: false, 
            error: 'Keyword and competitors array required' 
          }, { status: 400 });
        }

        const results = await client.getCompetitorAnalysis(keyword, competitors);
        return NextResponse.json<SERPAPIResponse>({ success: true, data: results });
      }

      default:
        return NextResponse.json<SERPAPIResponse>({ 
          success: false, 
          error: 'Invalid action' 
        }, { status: 400 });
    }
  } catch (error) {
    console.error('SERP tracking error:', error);
    return NextResponse.json<SERPAPIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
});