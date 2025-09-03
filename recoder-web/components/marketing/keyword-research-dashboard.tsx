'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search,
  TrendingUp,
  Target,
  Users,
  Globe,
  Brain,
  BarChart3,
  Download,
  RefreshCw,
  Lightbulb,
  Zap,
  Eye,
  Filter,
  ArrowUp,
  ArrowDown,
  Minus,
  Plus,
  MapPin,
  Calendar,
  HelpCircle,
  Layers,
  Activity,
  PieChart,
  LineChart
} from 'lucide-react';

interface KeywordData {
  keyword: string;
  search_volume: number;
  competition: 'low' | 'medium' | 'high';
  competition_score: number;
  cpc: number;
  difficulty: number;
  opportunity: number;
  related_keywords: string[];
  long_tail_keywords: string[];
  questions: string[];
  serp_features: string[];
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  trends: any[];
  top_ranking_domains: string[];
  content_suggestions: string[];
  estimated_traffic: number;
  seasonal_multiplier: number;
}

const intentColors = {
  informational: 'bg-blue-100 text-blue-800',
  commercial: 'bg-green-100 text-green-800',
  transactional: 'bg-purple-100 text-purple-800',
  navigational: 'bg-yellow-100 text-yellow-800'
};

const competitionColors = {
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-red-100 text-red-800'
};

export function KeywordResearchDashboard() {
  const [seedKeyword, setSeedKeyword] = useState('');
  const [keywords, setKeywords] = useState<KeywordData[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [trendingKeywords, setTrendingKeywords] = useState<any[]>([]);
  const [competitorKeywords, setCompetitorKeywords] = useState<any>({});
  const [questionKeywords, setQuestionKeywords] = useState<string[]>([]);
  const [longTailKeywords, setLongTailKeywords] = useState<string[]>([]);
  const [keywordClusters, setKeywordClusters] = useState<any[]>([]);
  
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('research');
  const [location, setLocation] = useState('US');
  const [language, setLanguage] = useState('en');
  const [competitors, setCompetitors] = useState<string[]>(['']);
  
  const [filters, setFilters] = useState({
    minSearchVolume: 0,
    maxDifficulty: 100,
    intent: 'all',
    competition: 'all'
  });

  // Research keywords
  const handleResearchKeywords = async () => {
    if (!seedKeyword.trim()) return;
    
    setIsLoading(true);
    try {
      const keywordsToResearch = [seedKeyword, ...suggestions.slice(0, 5)];
      
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'research_keywords',
          keywords: keywordsToResearch,
          location,
          language,
          limit: 50
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setKeywords(data.result);
      }
    } catch (error) {
      console.error('Keyword research failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get keyword suggestions
  const handleGetSuggestions = async () => {
    if (!seedKeyword.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'get_suggestions',
          seed_keyword: seedKeyword,
          location,
          language,
          limit: 100
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setSuggestions(data.result);
      }
    } catch (error) {
      console.error('Failed to get suggestions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get trending keywords
  const handleGetTrending = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trending_keywords',
          location,
          language,
          limit: 30
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setTrendingKeywords(data.result);
      }
    } catch (error) {
      console.error('Failed to get trending keywords:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get competitor keywords
  const handleCompetitorAnalysis = async () => {
    const validCompetitors = competitors.filter(c => c.trim());
    if (validCompetitors.length === 0) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'competitor_keywords',
          competitors: validCompetitors,
          location,
          limit: 50
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setCompetitorKeywords(data.result);
      }
    } catch (error) {
      console.error('Competitor analysis failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get question keywords
  const handleQuestionKeywords = async () => {
    if (!seedKeyword.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'question_keywords',
          seed_keyword: seedKeyword,
          location,
          language
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setQuestionKeywords(data.result);
      }
    } catch (error) {
      console.error('Failed to get question keywords:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get long-tail keywords
  const handleLongTailResearch = async () => {
    if (!seedKeyword.trim()) return;
    
    setIsLoading(true);
    try {
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'long_tail_research',
          seed_keyword: seedKeyword,
          location,
          language,
          limit: 50
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setLongTailKeywords(data.result);
      }
    } catch (error) {
      console.error('Failed to get long-tail keywords:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get keyword clusters
  const handleKeywordClustering = async () => {
    if (keywords.length === 0) return;
    
    setIsLoading(true);
    try {
      const keywordList = keywords.map(k => k.keyword);
      
      const response = await fetch('/api/marketing/keyword-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'keyword_clusters',
          keywords: keywordList,
          location
        })
      });
      
      const data = await response.json();
      if (data.success) {
        setKeywordClusters(data.result);
      }
    } catch (error) {
      console.error('Keyword clustering failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Filter keywords
  const filteredKeywords = keywords.filter(keyword => {
    return (
      keyword.search_volume >= filters.minSearchVolume &&
      keyword.difficulty <= filters.maxDifficulty &&
      (filters.intent === 'all' || keyword.intent === filters.intent) &&
      (filters.competition === 'all' || keyword.competition === filters.competition)
    );
  });

  // Auto-suggestions when seed keyword changes
  useEffect(() => {
    if (seedKeyword.length >= 3) {
      const timeoutId = setTimeout(() => {
        handleGetSuggestions();
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [seedKeyword]);

  const exportKeywords = () => {
    const exportData = filteredKeywords.map(kw => ({
      keyword: kw.keyword,
      search_volume: kw.search_volume,
      difficulty: kw.difficulty,
      competition: kw.competition,
      cpc: kw.cpc,
      estimated_traffic: kw.estimated_traffic,
      intent: kw.intent,
      opportunity: kw.opportunity
    }));
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `keyword-research-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Keyword Research Dashboard</h1>
            <p className="text-gray-600">Advanced keyword research with real-time data and AI-powered insights</p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={exportKeywords}
              disabled={filteredKeywords.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Search Controls */}
      <div className="p-6 border-b border-gray-200">
        <div className="space-y-4">
          {/* Main Search */}
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Enter seed keyword (e.g., 'digital marketing')"
                value={seedKeyword}
                onChange={(e) => setSeedKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleResearchKeywords()}
                className="text-base"
              />
            </div>
            <Button 
              onClick={handleResearchKeywords} 
              disabled={isLoading || !seedKeyword.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Search className="h-4 w-4 mr-2" />
              {isLoading ? 'Researching...' : 'Research'}
            </Button>
          </div>

          {/* Location and Language */}
          <div className="flex gap-3">
            <div className="w-48">
              <Label className="text-xs">Location</Label>
              <Select value={location} onValueChange={setLocation}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="US">🇺🇸 United States</SelectItem>
                  <SelectItem value="UK">🇬🇧 United Kingdom</SelectItem>
                  <SelectItem value="CA">🇨🇦 Canada</SelectItem>
                  <SelectItem value="AU">🇦🇺 Australia</SelectItem>
                  <SelectItem value="DE">🇩🇪 Germany</SelectItem>
                  <SelectItem value="FR">🇫🇷 France</SelectItem>
                  <SelectItem value="ES">🇪🇸 Spain</SelectItem>
                  <SelectItem value="BR">🇧🇷 Brazil</SelectItem>
                  <SelectItem value="IN">🇮🇳 India</SelectItem>
                  <SelectItem value="JP">🇯🇵 Japan</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="w-32">
              <Label className="text-xs">Language</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="pt">Portuguese</SelectItem>
                  <SelectItem value="ja">Japanese</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
          <TabsList className="mx-6 mt-4 grid w-fit grid-cols-7">
            <TabsTrigger value="research" className="text-xs">
              <Target className="h-3 w-3 mr-1" />
              Research
            </TabsTrigger>
            <TabsTrigger value="suggestions" className="text-xs">
              <Lightbulb className="h-3 w-3 mr-1" />
              Suggestions
            </TabsTrigger>
            <TabsTrigger value="trending" className="text-xs">
              <TrendingUp className="h-3 w-3 mr-1" />
              Trending
            </TabsTrigger>
            <TabsTrigger value="competitors" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              Competitors
            </TabsTrigger>
            <TabsTrigger value="questions" className="text-xs">
              <HelpCircle className="h-3 w-3 mr-1" />
              Questions
            </TabsTrigger>
            <TabsTrigger value="longtail" className="text-xs">
              <Activity className="h-3 w-3 mr-1" />
              Long-tail
            </TabsTrigger>
            <TabsTrigger value="clusters" className="text-xs">
              <Layers className="h-3 w-3 mr-1" />
              Clusters
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden">
            {/* Research Tab */}
            <TabsContent value="research" className="h-full mt-0 p-6">
              <div className="flex gap-6 h-full">
                {/* Filters Sidebar */}
                <div className="w-64 space-y-4">
                  <Card className="p-4">
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Filters
                    </h3>
                    
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs">Min Search Volume</Label>
                        <Input
                          type="number"
                          value={filters.minSearchVolume}
                          onChange={(e) => setFilters(f => ({ ...f, minSearchVolume: parseInt(e.target.value) || 0 }))}
                          className="h-8"
                        />
                      </div>
                      
                      <div>
                        <Label className="text-xs">Max Difficulty</Label>
                        <Input
                          type="number"
                          max="100"
                          value={filters.maxDifficulty}
                          onChange={(e) => setFilters(f => ({ ...f, maxDifficulty: parseInt(e.target.value) || 100 }))}
                          className="h-8"
                        />
                      </div>
                      
                      <div>
                        <Label className="text-xs">Search Intent</Label>
                        <Select 
                          value={filters.intent} 
                          onValueChange={(value) => setFilters(f => ({ ...f, intent: value }))}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Intents</SelectItem>
                            <SelectItem value="informational">Informational</SelectItem>
                            <SelectItem value="commercial">Commercial</SelectItem>
                            <SelectItem value="transactional">Transactional</SelectItem>
                            <SelectItem value="navigational">Navigational</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label className="text-xs">Competition Level</Label>
                        <Select 
                          value={filters.competition} 
                          onValueChange={(value) => setFilters(f => ({ ...f, competition: value }))}
                        >
                          <SelectTrigger className="h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">All Levels</SelectItem>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </Card>

                  {/* Stats */}
                  <Card className="p-4">
                    <h3 className="font-medium mb-3 flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Stats
                    </h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Keywords:</span>
                        <span className="font-medium">{keywords.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Filtered:</span>
                        <span className="font-medium">{filteredKeywords.length}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg Volume:</span>
                        <span className="font-medium">
                          {filteredKeywords.length > 0 ? 
                            Math.round(filteredKeywords.reduce((sum, k) => sum + k.search_volume, 0) / filteredKeywords.length)
                            : 0
                          }
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Avg Difficulty:</span>
                        <span className="font-medium">
                          {filteredKeywords.length > 0 ? 
                            Math.round(filteredKeywords.reduce((sum, k) => sum + k.difficulty, 0) / filteredKeywords.length)
                            : 0
                          }
                        </span>
                      </div>
                    </div>
                  </Card>
                </div>

                {/* Keywords List */}
                <div className="flex-1">
                  <ScrollArea className="h-full">
                    {filteredKeywords.length === 0 ? (
                      <div className="text-center py-16">
                        <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">Start Your Keyword Research</h3>
                        <p className="text-gray-500 mb-6">Enter a seed keyword to discover high-opportunity keywords with real-time data</p>
                        {isLoading && (
                          <div className="flex items-center justify-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Analyzing keywords...</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {filteredKeywords.map((keyword, index) => (
                          <Card key={index} className="p-4 hover:bg-gray-50 transition-colors">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <h3 className="font-medium text-gray-900">{keyword.keyword}</h3>
                                <div className="flex items-center gap-2">
                                  <Badge className={`text-xs ${intentColors[keyword.intent]}`}>
                                    {keyword.intent}
                                  </Badge>
                                  <Badge variant="outline" className={`text-xs ${competitionColors[keyword.competition]}`}>
                                    {keyword.competition} comp
                                  </Badge>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="text-lg font-bold text-gray-900">
                                  {keyword.search_volume.toLocaleString()}
                                </div>
                                <div className="text-xs text-gray-500">monthly searches</div>
                              </div>
                            </div>
                            
                            <div className="grid grid-cols-4 gap-4 mb-3">
                              <div>
                                <Label className="text-xs text-gray-600">Difficulty</Label>
                                <div className="flex items-center gap-2">
                                  <Progress value={keyword.difficulty} className="flex-1 h-2" />
                                  <span className="text-xs font-medium w-8">{keyword.difficulty}</span>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Opportunity</Label>
                                <div className="flex items-center gap-2">
                                  <Progress value={keyword.opportunity} className="flex-1 h-2" />
                                  <span className="text-xs font-medium w-8">{keyword.opportunity}</span>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">CPC</Label>
                                <div className="text-sm font-medium">${keyword.cpc.toFixed(2)}</div>
                              </div>
                              <div>
                                <Label className="text-xs text-gray-600">Est. Traffic</Label>
                                <div className="text-sm font-medium">{keyword.estimated_traffic}/month</div>
                              </div>
                            </div>
                            
                            <div className="text-xs text-gray-600">
                              <span className="font-medium">SERP Features:</span> {keyword.serp_features.join(', ')}
                            </div>
                            
                            {keyword.content_suggestions.length > 0 && (
                              <div className="mt-2 text-xs text-blue-600">
                                💡 {keyword.content_suggestions[0]}
                              </div>
                            )}
                          </Card>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            {/* Suggestions Tab */}
            <TabsContent value="suggestions" className="h-full mt-0 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Keyword Suggestions</h2>
                <Button 
                  variant="outline"
                  onClick={handleGetSuggestions}
                  disabled={!seedKeyword.trim() || isLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh Suggestions
                </Button>
              </div>
              
              <ScrollArea className="h-full">
                {suggestions.length === 0 ? (
                  <div className="text-center py-16">
                    <Lightbulb className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Suggestions Yet</h3>
                    <p className="text-gray-500">Enter a seed keyword to get intelligent suggestions</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {suggestions.map((suggestion, index) => (
                      <Card 
                        key={index} 
                        className="p-3 hover:bg-blue-50 cursor-pointer transition-colors"
                        onClick={() => setSeedKeyword(suggestion)}
                      >
                        <div className="text-sm font-medium text-gray-900">{suggestion}</div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Trending Tab */}
            <TabsContent value="trending" className="h-full mt-0 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Trending Keywords</h2>
                <Button 
                  variant="outline"
                  onClick={handleGetTrending}
                  disabled={isLoading}
                >
                  <TrendingUp className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Get Trending
                </Button>
              </div>
              
              <ScrollArea className="h-full">
                {trendingKeywords.length === 0 ? (
                  <div className="text-center py-16">
                    <TrendingUp className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Discover Trending Keywords</h3>
                    <p className="text-gray-500">Click "Get Trending" to discover what's hot in your market</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {trendingKeywords.map((trend, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-medium text-gray-900">{trend.keyword}</h3>
                          <div className="flex items-center gap-2">
                            <Badge className={`text-xs ${
                              trend.trend_type === 'rising' ? 'bg-green-100 text-green-800' :
                              trend.trend_type === 'breaking' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {trend.trend_type}
                            </Badge>
                            <div className="text-lg font-bold">+{trend.growth_rate}%</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-gray-600">Volume:</span> <span className="font-medium">{trend.search_volume?.toLocaleString()}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">News:</span> <span className="font-medium">{trend.news_volume}</span>
                          </div>
                          <div>
                            <span className="text-gray-600">Social:</span> <span className="font-medium">{trend.social_mentions}</span>
                          </div>
                        </div>
                        {trend.related_topics && (
                          <div className="mt-2 text-xs text-gray-600">
                            <span className="font-medium">Topics:</span> {trend.related_topics.join(', ')}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Competitors Tab */}
            <TabsContent value="competitors" className="h-full mt-0 p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Competitor Analysis</h2>
                  <Button 
                    variant="outline"
                    onClick={handleCompetitorAnalysis}
                    disabled={isLoading || competitors.filter(c => c.trim()).length === 0}
                  >
                    <Users className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                    Analyze
                  </Button>
                </div>
                
                {/* Competitor Input */}
                <Card className="p-4">
                  <Label className="text-sm font-medium mb-2 block">Competitor Domains</Label>
                  <div className="space-y-2">
                    {competitors.map((competitor, index) => (
                      <div key={index} className="flex gap-2">
                        <Input
                          placeholder="competitor.com"
                          value={competitor}
                          onChange={(e) => {
                            const newCompetitors = [...competitors];
                            newCompetitors[index] = e.target.value;
                            setCompetitors(newCompetitors);
                          }}
                          className="flex-1"
                        />
                        {competitors.length > 1 && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setCompetitors(competitors.filter((_, i) => i !== index))}
                            className="px-2"
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCompetitors([...competitors, ''])}
                      className="w-fit"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add Competitor
                    </Button>
                  </div>
                </Card>
                
                <ScrollArea className="flex-1">
                  {Object.keys(competitorKeywords).length === 0 ? (
                    <div className="text-center py-16">
                      <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">Competitor Keyword Gap Analysis</h3>
                      <p className="text-gray-500">Add competitor domains and analyze their keyword strategies</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(competitorKeywords.competitors || {}).map(([domain, data]: [string, any]) => (
                        <Card key={domain} className="p-4">
                          <h3 className="font-medium text-gray-900 mb-3">{domain}</h3>
                          <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                            <div>
                              <span className="text-gray-600">Total Keywords:</span> 
                              <span className="font-medium ml-2">{data.total_keywords}</span>
                            </div>
                            <div>
                              <span className="text-gray-600">Opportunities:</span> 
                              <span className="font-medium ml-2">{data.opportunities?.length || 0}</span>
                            </div>
                          </div>
                          {data.top_keywords && (
                            <div>
                              <Label className="text-xs text-gray-600 mb-1 block">Top Keywords</Label>
                              <div className="flex flex-wrap gap-1">
                                {data.top_keywords.slice(0, 10).map((keyword: string, index: number) => (
                                  <Badge key={index} variant="outline" className="text-xs">
                                    {keyword}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          )}
                        </Card>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </TabsContent>

            {/* Questions Tab */}
            <TabsContent value="questions" className="h-full mt-0 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Question Keywords</h2>
                <Button 
                  variant="outline"
                  onClick={handleQuestionKeywords}
                  disabled={!seedKeyword.trim() || isLoading}
                >
                  <HelpCircle className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Find Questions
                </Button>
              </div>
              
              <ScrollArea className="h-full">
                {questionKeywords.length === 0 ? (
                  <div className="text-center py-16">
                    <HelpCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Question-Based Keywords</h3>
                    <p className="text-gray-500">Find questions people are asking about your seed keyword</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {questionKeywords.map((question, index) => (
                      <Card key={index} className="p-3 hover:bg-blue-50 transition-colors">
                        <div className="flex items-start gap-3">
                          <HelpCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <div className="font-medium text-gray-900">{question}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              Great for FAQ content and featured snippets
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Long-tail Tab */}
            <TabsContent value="longtail" className="h-full mt-0 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Long-tail Keywords</h2>
                <Button 
                  variant="outline"
                  onClick={handleLongTailResearch}
                  disabled={!seedKeyword.trim() || isLoading}
                >
                  <Activity className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Research Long-tail
                </Button>
              </div>
              
              <ScrollArea className="h-full">
                {longTailKeywords.length === 0 ? (
                  <div className="text-center py-16">
                    <Activity className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Long-tail Opportunities</h3>
                    <p className="text-gray-500">Discover low-competition, high-converting long-tail keywords</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {longTailKeywords.map((keyword, index) => (
                      <Card key={index} className="p-3 hover:bg-green-50 transition-colors">
                        <div className="font-medium text-gray-900 mb-1">{keyword}</div>
                        <div className="text-xs text-green-600">
                          🎯 Lower competition, higher conversion potential
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>

            {/* Clusters Tab */}
            <TabsContent value="clusters" className="h-full mt-0 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Keyword Clusters</h2>
                <Button 
                  variant="outline"
                  onClick={handleKeywordClustering}
                  disabled={keywords.length === 0 || isLoading}
                >
                  <Layers className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                  Generate Clusters
                </Button>
              </div>
              
              <ScrollArea className="h-full">
                {keywordClusters.length === 0 ? (
                  <div className="text-center py-16">
                    <Layers className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">Semantic Keyword Clusters</h3>
                    <p className="text-gray-500">Group related keywords for better content organization</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {keywordClusters.map((cluster, index) => (
                      <Card key={index} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-medium text-gray-900">{cluster.main_keyword}</h3>
                          <div className="text-sm text-gray-500">
                            {cluster.total_search_volume.toLocaleString()} volume
                          </div>
                        </div>
                        
                        <div className="mb-3">
                          <Label className="text-xs text-gray-600 mb-1 block">Content Theme: {cluster.content_theme}</Label>
                          <div className="flex flex-wrap gap-1">
                            {cluster.cluster_keywords.map((keyword: string, kIndex: number) => (
                              <Badge key={kIndex} variant="outline" className="text-xs">
                                {keyword}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        
                        {cluster.intent_distribution && (
                          <div className="grid grid-cols-4 gap-2 text-xs">
                            {Object.entries(cluster.intent_distribution).map(([intent, percentage]) => (
                              <div key={intent} className="text-center">
                                <div className="font-medium">{percentage}%</div>
                                <div className="text-gray-600 capitalize">{intent}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}