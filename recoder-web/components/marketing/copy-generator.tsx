'use client';

import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { 
  Wand2, 
  Copy, 
  Download, 
  BarChart3, 
  Zap,
  Target,
  Users,
  Lightbulb,
  TrendingUp,
  Eye,
  MousePointer,
  Heart,
  RefreshCw,
  Sparkles,
  DollarSign
} from 'lucide-react';

interface CopyVariation {
  id: string;
  variation_name: string;
  copy: string;
  approach: string;
  word_count: number;
  estimated_performance: number;
  performance_score: number;
}

interface PerformanceAnalysis {
  overall_score: number;
  strengths: string[];
  improvements: string[];
  predicted_metrics: {
    click_through_rate: number;
    conversion_rate: number;
    engagement_score: number;
  };
  best_variation: CopyVariation | null;
}

export function CopyGenerator() {
  const [formData, setFormData] = useState({
    copy_type: 'landing_page',
    product_name: '',
    product_description: '',
    target_audience: '',
    key_benefits: [''],
    tone: 'professional',
    platform: '',
    word_limit: '',
    include_cta: true,
    brand_voice: '',
    competitor_analysis: false,
    model_preference: 'together_ai'
  });

  const [generatedCopy, setGeneratedCopy] = useState<CopyVariation[]>([]);
  const [performanceAnalysis, setPerformanceAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [abTestSuggestions, setAbTestSuggestions] = useState<any[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState('input');

  const copyTypes = [
    { value: 'landing_page', label: 'Landing Page', icon: '🎯' },
    { value: 'email_campaign', label: 'Email Campaign', icon: '📧' },
    { value: 'social_post', label: 'Social Media Post', icon: '📱' },
    { value: 'ad_copy', label: 'Ad Copy', icon: '📢' },
    { value: 'product_description', label: 'Product Description', icon: '🛍️' },
    { value: 'blog_post', label: 'Blog Post', icon: '📝' }
  ];

  const tones = [
    { value: 'professional', label: 'Professional' },
    { value: 'casual', label: 'Casual' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'friendly', label: 'Friendly' },
    { value: 'authoritative', label: 'Authoritative' }
  ];

  const platforms = [
    { value: 'facebook', label: 'Facebook' },
    { value: 'google', label: 'Google Ads' },
    { value: 'linkedin', label: 'LinkedIn' },
    { value: 'twitter', label: 'Twitter/X' },
    { value: 'instagram', label: 'Instagram' }
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleBenefitChange = (index: number, value: string) => {
    const newBenefits = [...formData.key_benefits];
    newBenefits[index] = value;
    setFormData(prev => ({
      ...prev,
      key_benefits: newBenefits
    }));
  };

  const addBenefit = () => {
    setFormData(prev => ({
      ...prev,
      key_benefits: [...prev.key_benefits, '']
    }));
  };

  const removeBenefit = (index: number) => {
    if (formData.key_benefits.length > 1) {
      const newBenefits = formData.key_benefits.filter((_, i) => i !== index);
      setFormData(prev => ({
        ...prev,
        key_benefits: newBenefits
      }));
    }
  };

  const generateCopy = async () => {
    if (!formData.product_name || !formData.product_description || !formData.target_audience) {
      alert('Please fill in all required fields');
      return;
    }

    setIsGenerating(true);
    setActiveTab('results');

    try {
      const response = await fetch('/api/marketing/copy-generator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          key_benefits: formData.key_benefits.filter(b => b.trim() !== ''),
          word_limit: formData.word_limit ? parseInt(formData.word_limit) : undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate copy');
      }

      const data = await response.json();
      setGeneratedCopy(data.generated_copy);
      setPerformanceAnalysis(data.performance_analysis);
      setAbTestSuggestions(data.ab_test_suggestions);
    } catch (error) {
      console.error('Copy generation error:', error);
      alert('Failed to generate copy. Please try again.');
      setActiveTab('input');
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  const getPerformanceColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50';
    if (score >= 60) return 'text-yellow-600 bg-yellow-50';
    return 'text-red-600 bg-red-50';
  };

  const getPerformanceIcon = (score: number) => {
    if (score >= 80) return <TrendingUp className="h-4 w-4" />;
    if (score >= 60) return <BarChart3 className="h-4 w-4" />;
    return <Eye className="h-4 w-4" />;
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">AI Marketing Copy Generator</h1>
        <p className="text-gray-600">Generate high-converting copy with Together AI models - cost-effective and powerful</p>
        <div className="flex items-center gap-2 mt-3">
          <Badge variant="secondary" className="bg-green-50 text-green-700">
            <DollarSign className="h-3 w-3 mr-1" />
            Cost-Effective AI
          </Badge>
          <Badge variant="secondary" className="bg-blue-50 text-blue-700">
            <Sparkles className="h-3 w-3 mr-1" />
            3 Unique Variations
          </Badge>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="input">
            <Target className="h-4 w-4 mr-2" />
            Input Details
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!generatedCopy.length}>
            <Lightbulb className="h-4 w-4 mr-2" />
            Generated Copy
          </TabsTrigger>
          <TabsTrigger value="analysis" disabled={!performanceAnalysis}>
            <BarChart3 className="h-4 w-4 mr-2" />
            Performance Analysis
          </TabsTrigger>
        </TabsList>

        <TabsContent value="input" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Basic Info */}
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Target className="h-5 w-5 mr-2 text-blue-600" />
                  Basic Information
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="copy_type">Copy Type *</Label>
                    <Select value={formData.copy_type} onValueChange={(value) => handleInputChange('copy_type', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {copyTypes.map(type => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.icon} {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor="product_name">Product/Service Name *</Label>
                    <Input
                      id="product_name"
                      value={formData.product_name}
                      onChange={(e) => handleInputChange('product_name', e.target.value)}
                      placeholder="e.g., CloudFlow Pro"
                    />
                  </div>

                  <div>
                    <Label htmlFor="product_description">Product Description *</Label>
                    <Textarea
                      id="product_description"
                      value={formData.product_description}
                      onChange={(e) => handleInputChange('product_description', e.target.value)}
                      placeholder="Describe what your product does and its main purpose..."
                      rows={3}
                    />
                  </div>

                  <div>
                    <Label htmlFor="target_audience">Target Audience *</Label>
                    <Input
                      id="target_audience"
                      value={formData.target_audience}
                      onChange={(e) => handleInputChange('target_audience', e.target.value)}
                      placeholder="e.g., Small business owners, Marketing professionals"
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-green-600" />
                  Key Benefits
                </h3>
                
                <div className="space-y-3">
                  {formData.key_benefits.map((benefit, index) => (
                    <div key={index} className="flex gap-2">
                      <Input
                        value={benefit}
                        onChange={(e) => handleBenefitChange(index, e.target.value)}
                        placeholder={`Benefit ${index + 1}`}
                        className="flex-1"
                      />
                      {formData.key_benefits.length > 1 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => removeBenefit(index)}
                          className="px-3"
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  ))}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={addBenefit}
                    className="w-full"
                  >
                    + Add Benefit
                  </Button>
                </div>
              </Card>
            </div>

            {/* Right Column - Settings */}
            <div className="space-y-6">
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <Users className="h-5 w-5 mr-2 text-purple-600" />
                  Style & Preferences
                </h3>
                
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="tone">Tone</Label>
                    <Select value={formData.tone} onValueChange={(value) => handleInputChange('tone', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {tones.map(tone => (
                          <SelectItem key={tone.value} value={tone.value}>
                            {tone.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {(formData.copy_type === 'ad_copy' || formData.copy_type === 'social_post') && (
                    <div>
                      <Label htmlFor="platform">Platform</Label>
                      <Select value={formData.platform} onValueChange={(value) => handleInputChange('platform', value)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select platform" />
                        </SelectTrigger>
                        <SelectContent>
                          {platforms.map(platform => (
                            <SelectItem key={platform.value} value={platform.value}>
                              {platform.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="word_limit">Word Limit (optional)</Label>
                    <Input
                      id="word_limit"
                      type="number"
                      value={formData.word_limit}
                      onChange={(e) => handleInputChange('word_limit', e.target.value)}
                      placeholder="e.g., 50"
                    />
                  </div>

                  <div>
                    <Label htmlFor="brand_voice">Brand Voice (optional)</Label>
                    <Input
                      id="brand_voice"
                      value={formData.brand_voice}
                      onChange={(e) => handleInputChange('brand_voice', e.target.value)}
                      placeholder="e.g., Innovative, trustworthy, approachable"
                    />
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4">Advanced Options</h3>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label htmlFor="include_cta">Include Call-to-Action</Label>
                      <p className="text-sm text-gray-500">Add compelling CTA to drive action</p>
                    </div>
                    <Switch
                      id="include_cta"
                      checked={formData.include_cta}
                      onCheckedChange={(checked) => handleInputChange('include_cta', checked)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="model_preference">AI Model</Label>
                    <Select value={formData.model_preference} onValueChange={(value) => handleInputChange('model_preference', value)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="together_ai">
                          <div className="flex items-center">
                            <DollarSign className="h-4 w-4 mr-2 text-green-500" />
                            Together AI (Cost-Effective)
                          </div>
                        </SelectItem>
                        <SelectItem value="openrouter">
                          <div className="flex items-center">
                            <Sparkles className="h-4 w-4 mr-2 text-blue-500" />
                            OpenRouter (Premium)
                          </div>
                        </SelectItem>
                        <SelectItem value="auto">Auto Select</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </Card>

              <Button
                onClick={generateCopy}
                disabled={isGenerating || !formData.product_name || !formData.product_description || !formData.target_audience}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Generating Copy...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 mr-2" />
                    Generate Marketing Copy
                  </>
                )}
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="results" className="space-y-6">
          {generatedCopy.length > 0 && (
            <div className="grid gap-6">
              {generatedCopy.map((variation, index) => (
                <Card key={variation.id} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                        {variation.variation_name}
                      </Badge>
                      <span className="text-sm text-gray-500">{variation.approach}</span>
                      <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getPerformanceColor(variation.performance_score || variation.estimated_performance)}`}>
                        {getPerformanceIcon(variation.performance_score || variation.estimated_performance)}
                        {variation.performance_score || variation.estimated_performance}/100
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyToClipboard(variation.copy)}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>
                  
                  <div className="bg-gray-50 rounded-lg p-4 mb-3">
                    <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">{variation.copy}</p>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{variation.word_count} words</span>
                    <span>•</span>
                    <span>Est. Performance: {variation.estimated_performance}/100</span>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="analysis" className="space-y-6">
          {performanceAnalysis && (
            <div className="grid gap-6">
              {/* Overall Performance */}
              <Card className="p-6">
                <h3 className="text-lg font-semibold mb-4 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-blue-600" />
                  Performance Overview
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-2xl ${getPerformanceColor(performanceAnalysis.overall_score)}`}>
                      {performanceAnalysis.overall_score}/100
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Overall Score</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-green-600">
                      <Eye className="h-6 w-6" />
                      {performanceAnalysis.predicted_metrics.click_through_rate.toFixed(1)}%
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Predicted CTR</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="flex items-center justify-center gap-2 text-2xl font-semibold text-blue-600">
                      <MousePointer className="h-6 w-6" />
                      {performanceAnalysis.predicted_metrics.conversion_rate.toFixed(1)}%
                    </div>
                    <p className="text-sm text-gray-500 mt-1">Predicted CVR</p>
                  </div>
                </div>
              </Card>

              {/* Best Variation */}
              {performanceAnalysis.best_variation && (
                <Card className="p-6 border-green-200 bg-green-50">
                  <h3 className="text-lg font-semibold mb-3 flex items-center text-green-700">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Best Performing Variation
                  </h3>
                  
                  <div className="bg-white rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <Badge className="bg-green-100 text-green-700">
                        {performanceAnalysis.best_variation.variation_name}
                      </Badge>
                      <div className="flex items-center gap-1 text-green-600 font-semibold">
                        <TrendingUp className="h-4 w-4" />
                        {performanceAnalysis.best_variation.performance_score || performanceAnalysis.best_variation.estimated_performance}/100
                      </div>
                    </div>
                    <p className="text-gray-900 leading-relaxed">{performanceAnalysis.best_variation.copy}</p>
                  </div>
                </Card>
              )}

              {/* Insights */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center text-green-600">
                    <Heart className="h-5 w-5 mr-2" />
                    Strengths
                  </h3>
                  <ul className="space-y-2">
                    {performanceAnalysis.strengths.map((strength, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                        <span className="text-sm">{strength}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
                
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-3 flex items-center text-orange-600">
                    <Lightbulb className="h-5 w-5 mr-2" />
                    Improvements
                  </h3>
                  <ul className="space-y-2">
                    {performanceAnalysis.improvements.map((improvement, index) => (
                      <li key={index} className="flex items-start gap-2">
                        <div className="w-1.5 h-1.5 bg-orange-500 rounded-full mt-2 flex-shrink-0" />
                        <span className="text-sm">{improvement}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              {/* A/B Test Suggestions */}
              {abTestSuggestions.length > 0 && (
                <Card className="p-6">
                  <h3 className="text-lg font-semibold mb-4 flex items-center">
                    <BarChart3 className="h-5 w-5 mr-2 text-purple-600" />
                    A/B Testing Recommendations
                  </h3>
                  
                  <div className="space-y-4">
                    {abTestSuggestions.map((suggestion, index) => (
                      <div key={index} className="border rounded-lg p-4">
                        <h4 className="font-medium mb-2">{suggestion.test_name}</h4>
                        <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                          <div>
                            <span className="font-medium">Primary Metric:</span>
                            <div>{suggestion.primary_metric.replace('_', ' ')}</div>
                          </div>
                          <div>
                            <span className="font-medium">Traffic Split:</span>
                            <div>{suggestion.recommended_traffic_split}</div>
                          </div>
                          <div>
                            <span className="font-medium">Sample Size:</span>
                            <div>{suggestion.minimum_sample_size.toLocaleString()}</div>
                          </div>
                          <div>
                            <span className="font-medium">Duration:</span>
                            <div>{suggestion.estimated_duration}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}