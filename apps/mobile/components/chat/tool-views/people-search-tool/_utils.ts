import type { ToolCallData, ToolResultData } from '@/lib/utils/tool-data-extractor';

export interface PeopleSearchResult {
  id: string;
  url: string;
  person_id?: string;
  name: string;
  location: string;
  title: string;
  company: string;
  profile_image_url: string;
  description: string;
}

export interface PeopleSearchData {
  query: string | null;
  total_results: number;
  results: PeopleSearchResult[];
  success: boolean;
}

const parseContent = (content: any): any => {
  if (typeof content === 'string') {
    try {
      return JSON.parse(content);
    } catch (e) {
      return content;
    }
  }
  return content;
};

export function extractPeopleSearchData({ toolCall, toolResult }: { toolCall: ToolCallData; toolResult?: ToolResultData }): PeopleSearchData {
  const args = typeof toolCall.arguments === 'object' ? toolCall.arguments : JSON.parse(toolCall.arguments);
  
  let query = args?.query || null;
  let results: PeopleSearchResult[] = [];
  let total_results = 0;
  
  if (toolResult?.output) {
    const output = typeof toolResult.output === 'string' 
      ? parseContent(toolResult.output) 
      : toolResult.output;
    
    if (output && typeof output === 'object') {
      query = query || output.query || null;
      total_results = output.total_results || 0;
      
      if (Array.isArray(output.results)) {
        results = output.results.map((r: any) => ({
          id: r.id || r.person_id || '',
          person_id: r.person_id || r.id || '',
          url: r.url || '',
          name: r.name || r.person_name || 'Unknown',
          location: r.location || r.person_location || '',
          title: r.title || r.person_position || '',
          company: r.company || r.organization || '',
          profile_image_url: r.profile_image_url || r.person_picture_url || '',
          description: r.description || '',
        }));
      }
    }
  }
  
  return {
    query,
    total_results,
    results,
    success: toolResult?.success ?? true
  };
}
