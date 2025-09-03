'use client';

import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  PieChart, 
  Pie, 
  Cell,
  LineChart,
  Line,
  ScatterChart,
  Scatter,
  ResponsiveContainer,
  Legend
} from 'recharts';

interface KeywordData {
  keyword: string;
  search_volume: number;
  competition: 'low' | 'medium' | 'high';
  competition_score: number;
  cpc: number;
  difficulty: number;
  opportunity: number;
  intent: 'informational' | 'navigational' | 'commercial' | 'transactional';
  estimated_traffic: number;
}

interface KeywordVisualizationProps {
  keywords: KeywordData[];
}

const INTENT_COLORS = {
  informational: '#3b82f6',
  commercial: '#10b981',
  transactional: '#8b5cf6',
  navigational: '#f59e0b'
};

const COMPETITION_COLORS = {
  low: '#10b981',
  medium: '#f59e0b',
  high: '#ef4444'
};

export function KeywordVisualization({ keywords }: KeywordVisualizationProps) {
  if (keywords.length === 0) {
    return (
      <div className="text-center py-16">
        <BarChart className="h-16 w-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Data to Visualize</h3>
        <p className="text-gray-500">Add keywords to see comprehensive analytics</p>
      </div>
    );
  }

  // Prepare data for visualizations
  const searchVolumeData = keywords
    .sort((a, b) => b.search_volume - a.search_volume)
    .slice(0, 10)
    .map(k => ({
      keyword: k.keyword.length > 15 ? k.keyword.substring(0, 15) + '...' : k.keyword,
      volume: k.search_volume,
      fullKeyword: k.keyword
    }));

  const intentDistribution = keywords.reduce((acc, k) => {
    acc[k.intent] = (acc[k.intent] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const intentData = Object.entries(intentDistribution).map(([intent, count]) => ({
    name: intent.charAt(0).toUpperCase() + intent.slice(1),
    value: count,
    percentage: Math.round((count / keywords.length) * 100)
  }));

  const competitionDistribution = keywords.reduce((acc, k) => {
    acc[k.competition] = (acc[k.competition] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const competitionData = Object.entries(competitionDistribution).map(([level, count]) => ({
    name: level.charAt(0).toUpperCase() + level.slice(1),
    value: count,
    fill: COMPETITION_COLORS[level as keyof typeof COMPETITION_COLORS]
  }));

  const opportunityData = keywords
    .sort((a, b) => b.opportunity - a.opportunity)
    .slice(0, 15)
    .map(k => ({
      keyword: k.keyword.length > 12 ? k.keyword.substring(0, 12) + '...' : k.keyword,
      opportunity: k.opportunity,
      difficulty: k.difficulty,
      volume: k.search_volume,
      fullKeyword: k.keyword
    }));

  const difficultyVsVolumeData = keywords.map(k => ({
    x: k.difficulty,
    y: k.search_volume,
    keyword: k.keyword,
    cpc: k.cpc,
    opportunity: k.opportunity
  }));

  const trendData = [
    { month: 'Jan', volume: 1200, difficulty: 45 },
    { month: 'Feb', volume: 1400, difficulty: 48 },
    { month: 'Mar', volume: 1600, difficulty: 52 },
    { month: 'Apr', volume: 1800, difficulty: 50 },
    { month: 'May', volume: 2000, difficulty: 55 },
    { month: 'Jun', volume: 2200, difficulty: 58 }
  ];

  return (
    <div className="space-y-6">
      {/* Top Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-2xl font-bold text-blue-600">
            {keywords.length.toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Total Keywords</div>
        </Card>
        
        <Card className="p-4">
          <div className="text-2xl font-bold text-green-600">
            {Math.round(keywords.reduce((sum, k) => sum + k.search_volume, 0) / keywords.length).toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Avg Search Volume</div>
        </Card>
        
        <Card className="p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {Math.round(keywords.reduce((sum, k) => sum + k.difficulty, 0) / keywords.length)}%
          </div>
          <div className="text-sm text-gray-600">Avg Difficulty</div>
        </Card>
        
        <Card className="p-4">
          <div className="text-2xl font-bold text-purple-600">
            {keywords.reduce((sum, k) => sum + k.estimated_traffic, 0).toLocaleString()}
          </div>
          <div className="text-sm text-gray-600">Est. Total Traffic</div>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-2 gap-6">
        {/* Search Volume Chart */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Top Keywords by Search Volume</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={searchVolumeData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3,3" />
              <XAxis 
                dataKey="keyword" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                fontSize={12}
              />
              <YAxis />
              <Tooltip 
                formatter={(value: any, name: any, props: any) => [
                  `${value.toLocaleString()} searches/month`,
                  props.payload.fullKeyword
                ]}
              />
              <Bar dataKey="volume" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Intent Distribution */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Search Intent Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={intentData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ name, percentage }) => `${name} (${percentage}%)`}
              >
                {intentData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={INTENT_COLORS[entry.name.toLowerCase() as keyof typeof INTENT_COLORS]} 
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        {/* Opportunity Analysis */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Keyword Opportunities</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={opportunityData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
              <CartesianGrid strokeDasharray="3,3" />
              <XAxis 
                dataKey="keyword" 
                angle={-45} 
                textAnchor="end" 
                height={80}
                fontSize={12}
              />
              <YAxis />
              <Tooltip 
                formatter={(value: any, name: any, props: any) => [
                  `${value}% opportunity`,
                  props.payload.fullKeyword
                ]}
              />
              <Bar dataKey="opportunity" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Competition Levels */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Competition Levels</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={competitionData}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
              >
                {competitionData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Advanced Analytics */}
      <div className="space-y-6">
        {/* Difficulty vs Volume Scatter */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Difficulty vs Search Volume Analysis</h3>
          <ResponsiveContainer width="100%" height={400}>
            <ScatterChart
              margin={{ top: 20, right: 20, bottom: 20, left: 20 }}
            >
              <CartesianGrid strokeDasharray="3,3" />
              <XAxis 
                type="number" 
                dataKey="x" 
                name="Difficulty" 
                domain={[0, 100]}
                label={{ value: 'Keyword Difficulty (%)', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                type="number" 
                dataKey="y" 
                name="Search Volume"
                label={{ value: 'Search Volume', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                cursor={{ strokeDasharray: '3,3' }}
                formatter={(value: any, name: any, props: any) => {
                  if (name === 'y') return [`${value.toLocaleString()} searches`, 'Search Volume'];
                  return [value, name];
                }}
                labelFormatter={(label: any, payload: any) => {
                  if (payload && payload[0]) {
                    return `${payload[0].payload.keyword} (Opportunity: ${payload[0].payload.opportunity}%)`;
                  }
                  return label;
                }}
              />
              <Scatter data={difficultyVsVolumeData} fill="#8884d8" />
            </ScatterChart>
          </ResponsiveContainer>
          <div className="mt-4 text-sm text-gray-600">
            💡 <strong>Sweet Spot:</strong> Look for keywords in the bottom-right area (high volume, low difficulty)
          </div>
        </Card>

        {/* Keyword Performance Matrix */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Keyword Performance Matrix</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Keyword</th>
                  <th className="text-right p-2">Volume</th>
                  <th className="text-center p-2">Difficulty</th>
                  <th className="text-center p-2">Competition</th>
                  <th className="text-center p-2">Opportunity</th>
                  <th className="text-right p-2">CPC</th>
                  <th className="text-center p-2">Intent</th>
                </tr>
              </thead>
              <tbody>
                {keywords
                  .sort((a, b) => b.opportunity - a.opportunity)
                  .slice(0, 15)
                  .map((keyword, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="p-2 font-medium">{keyword.keyword}</td>
                      <td className="p-2 text-right">{keyword.search_volume.toLocaleString()}</td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center">
                          <Progress value={keyword.difficulty} className="w-16 h-2 mr-2" />
                          <span className="text-xs w-8">{keyword.difficulty}</span>
                        </div>
                      </td>
                      <td className="p-2 text-center">
                        <Badge 
                          variant="outline" 
                          className={`text-xs ${
                            keyword.competition === 'low' ? 'text-green-700 border-green-300' :
                            keyword.competition === 'medium' ? 'text-yellow-700 border-yellow-300' :
                            'text-red-700 border-red-300'
                          }`}
                        >
                          {keyword.competition}
                        </Badge>
                      </td>
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center">
                          <Progress value={keyword.opportunity} className="w-16 h-2 mr-2" />
                          <span className="text-xs w-8 font-medium">{keyword.opportunity}</span>
                        </div>
                      </td>
                      <td className="p-2 text-right">${keyword.cpc.toFixed(2)}</td>
                      <td className="p-2 text-center">
                        <Badge 
                          className={`text-xs ${{
                            'informational': 'bg-blue-100 text-blue-800',
                            'commercial': 'bg-green-100 text-green-800',
                            'transactional': 'bg-purple-100 text-purple-800',
                            'navigational': 'bg-yellow-100 text-yellow-800'
                          }[keyword.intent]}`}
                        >
                          {keyword.intent}
                        </Badge>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Trend Analysis */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Market Trend Analysis (Last 6 Months)</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trendData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3,3" />
              <XAxis dataKey="month" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="volume"
                stroke="#3b82f6"
                strokeWidth={3}
                dot={{ fill: '#3b82f6', strokeWidth: 2, r: 6 }}
                name="Search Volume"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="difficulty"
                stroke="#ef4444"
                strokeWidth={2}
                strokeDasharray="5,5"
                dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                name="Avg Difficulty (%)"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Action Items */}
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Strategic Recommendations</h3>
        <div className="space-y-3">
          {keywords.filter(k => k.opportunity > 70 && k.difficulty < 40).length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-green-50 rounded-lg border border-green-200">
              <div className="w-2 h-2 bg-green-500 rounded-full mt-2"></div>
              <div>
                <div className="font-medium text-green-800">High Opportunity Keywords Found</div>
                <div className="text-sm text-green-700">
                  {keywords.filter(k => k.opportunity > 70 && k.difficulty < 40).length} keywords with high opportunity and low difficulty. 
                  Focus on these for quick wins.
                </div>
              </div>
            </div>
          )}
          
          {keywords.filter(k => k.intent === 'commercial').length > keywords.length * 0.3 && (
            <div className="flex items-start gap-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <div className="w-2 h-2 bg-blue-500 rounded-full mt-2"></div>
              <div>
                <div className="font-medium text-blue-800">Strong Commercial Intent</div>
                <div className="text-sm text-blue-700">
                  {Math.round((keywords.filter(k => k.intent === 'commercial').length / keywords.length) * 100)}% of keywords show commercial intent. 
                  Consider conversion-focused landing pages.
                </div>
              </div>
            </div>
          )}
          
          {keywords.filter(k => k.competition === 'low').length > 0 && (
            <div className="flex items-start gap-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
              <div className="w-2 h-2 bg-purple-500 rounded-full mt-2"></div>
              <div>
                <div className="font-medium text-purple-800">Low Competition Opportunities</div>
                <div className="text-sm text-purple-700">
                  {keywords.filter(k => k.competition === 'low').length} keywords with low competition detected. 
                  These could be easier ranking opportunities.
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}