'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  HelpCircle, Search, Book, Video, MessageSquare, ChevronDown,
  ChevronRight, Lightbulb, Star, Clock, Users, Code, Settings,
  Zap, Shield, Database, Globe, Rocket, PlayCircle, ExternalLink,
  ThumbsUp, ThumbsDown, Copy, CheckCircle, AlertCircle, X
} from 'lucide-react';
import { toast } from 'sonner';

interface HelpArticle {
  id: string;
  title: string;
  description: string;
  content: string;
  category: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  type: 'article' | 'video' | 'tutorial' | 'faq';
  readTime: number;
  helpful: number;
  views: number;
  lastUpdated: string;
  relatedArticles?: string[];
}

interface HelpCategory {
  id: string;
  name: string;
  icon: any;
  description: string;
  articleCount: number;
}

interface VideoTutorial {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  duration: string;
  category: string;
  difficulty: string;
  views: number;
  url: string;
}

export default function InAppHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HelpArticle[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<HelpArticle[]>([]);
  const helpRef = useRef<HTMLDivElement>(null);

  const categories: HelpCategory[] = [
    {
      id: 'getting-started',
      name: 'Getting Started',
      icon: Rocket,
      description: 'Quick start guides and platform basics',
      articleCount: 12
    },
    {
      id: 'code-generation',
      name: 'Code Generation',
      icon: Code,
      description: 'AI-powered code creation and best practices',
      articleCount: 18
    },
    {
      id: 'project-management',
      name: 'Project Management',
      icon: Settings,
      description: 'Managing projects, teams, and workflows',
      articleCount: 15
    },
    {
      id: 'deployment',
      name: 'Deployment',
      icon: Globe,
      description: 'Publishing and hosting your applications',
      articleCount: 10
    },
    {
      id: 'ai-features',
      name: 'AI Features',
      icon: Zap,
      description: 'Advanced AI capabilities and optimization',
      articleCount: 14
    },
    {
      id: 'security',
      name: 'Security',
      icon: Shield,
      description: 'Security best practices and compliance',
      articleCount: 8
    },
    {
      id: 'integrations',
      name: 'Integrations',
      icon: Database,
      description: 'Third-party services and API connections',
      articleCount: 11
    },
    {
      id: 'troubleshooting',
      name: 'Troubleshooting',
      icon: AlertCircle,
      description: 'Common issues and solutions',
      articleCount: 9
    }
  ];

  const popularArticles: HelpArticle[] = [
    {
      id: '1',
      title: 'Creating Your First Project with AI',
      description: 'Step-by-step guide to generating your first application using Recoder.xyz AI',
      content: `# Creating Your First Project with AI

Welcome to Recoder.xyz! This guide will walk you through creating your first AI-generated project in just a few minutes.

## Step 1: Choose Your Template

Start by selecting a project template that matches your goals:
- **Web Application**: Perfect for websites and web apps
- **Mobile App**: Cross-platform mobile applications
- **API Service**: Backend APIs and microservices
- **AI Assistant**: Intelligent chatbots and AI tools

## Step 2: Describe Your Vision

Tell our AI what you want to build. Be specific about:
- Core functionality
- Target audience
- Key features needed
- Technology preferences

## Step 3: AI Generation

Our AI will generate production-ready code including:
- Complete project structure
- Authentication system
- Database schema
- API endpoints
- Frontend components
- Deployment configuration

## Step 4: Customize and Deploy

Once generated, you can:
- Modify the code in our built-in editor
- Preview changes in real-time
- Deploy with one click
- Collaborate with your team

## Pro Tips

💡 **Be specific**: The more details you provide, the better your generated code will be.
💡 **Use examples**: Mention similar apps or websites for better context.
💡 **Iterate**: You can always refine and improve your project after generation.`,
      category: 'getting-started',
      tags: ['tutorial', 'beginner', 'project-creation', 'ai'],
      difficulty: 'beginner',
      type: 'tutorial',
      readTime: 5,
      helpful: 234,
      views: 1847,
      lastUpdated: '2024-01-15'
    },
    {
      id: '2', 
      title: 'Advanced AI Prompting Techniques',
      description: 'Learn how to write better prompts for more accurate and powerful code generation',
      content: `# Advanced AI Prompting Techniques

Master the art of AI prompting to get exactly the code you need.

## Understanding AI Context

The AI works best when you provide:
- Clear requirements
- Technical specifications
- Business context
- User stories

## Effective Prompting Patterns

### The Specification Pattern
\`\`\`
Build a React component that:
- Displays user profiles in a card layout
- Includes avatar, name, email, and role
- Has hover effects and click actions
- Uses TypeScript and Tailwind CSS
\`\`\`

### The Example Pattern
\`\`\`
Create an API endpoint similar to GitHub's user API:
- GET /api/users/:id
- Returns user profile data
- Includes error handling
- Uses proper HTTP status codes
\`\`\`

### The Constraint Pattern
\`\`\`
Generate a login form with these requirements:
- Must use React Hook Form
- Validate email and password
- Handle loading and error states
- Follow accessibility guidelines
\`\`\`

## Common Mistakes to Avoid

❌ **Too vague**: "Make a website"
✅ **Specific**: "Create a portfolio website with project showcase, contact form, and blog"

❌ **No context**: "Add authentication"
✅ **With context**: "Add JWT-based authentication for a B2B SaaS application with role-based access control"`,
      category: 'ai-features',
      tags: ['advanced', 'prompting', 'ai', 'best-practices'],
      difficulty: 'intermediate',
      type: 'article',
      readTime: 8,
      helpful: 189,
      views: 1205,
      lastUpdated: '2024-01-12'
    },
    {
      id: '3',
      title: 'Deploying to Production: Complete Guide',
      description: 'Everything you need to know about deploying your generated applications to production',
      content: `# Deploying to Production: Complete Guide

Deploy your Recoder.xyz projects to production with confidence.

## Deployment Options

### 1. One-Click Deployment
- Vercel integration
- Netlify support  
- AWS Amplify
- Railway deployment

### 2. Custom Infrastructure
- Docker containers
- Kubernetes clusters
- CI/CD pipelines
- Multi-environment setup

## Pre-Deployment Checklist

✅ Environment variables configured
✅ Database connections tested
✅ SSL certificates setup
✅ Domain configuration complete
✅ Monitoring and logging enabled

## Security Considerations

- Enable HTTPS everywhere
- Configure CORS properly
- Implement rate limiting
- Set up authentication
- Regular security audits

## Performance Optimization

- Enable CDN
- Optimize bundle size
- Configure caching
- Database indexing
- Image optimization

## Monitoring and Maintenance

Set up monitoring for:
- Application performance
- Error rates
- User analytics
- System resources
- Security events`,
      category: 'deployment',
      tags: ['deployment', 'production', 'devops', 'security'],
      difficulty: 'advanced',
      type: 'tutorial',
      readTime: 12,
      helpful: 156,
      views: 892,
      lastUpdated: '2024-01-10'
    }
  ];

  const videoTutorials: VideoTutorial[] = [
    {
      id: 'v1',
      title: 'Getting Started with Recoder.xyz',
      description: 'Complete walkthrough of the platform and your first project',
      thumbnail: '/videos/getting-started-thumb.jpg',
      duration: '8:42',
      category: 'getting-started',
      difficulty: 'beginner',
      views: 5234,
      url: 'https://www.youtube.com/watch?v=example1'
    },
    {
      id: 'v2',
      title: 'AI Code Generation Masterclass',
      description: 'Advanced techniques for generating better code with AI',
      thumbnail: '/videos/ai-masterclass-thumb.jpg',
      duration: '15:30',
      category: 'ai-features', 
      difficulty: 'intermediate',
      views: 3421,
      url: 'https://www.youtube.com/watch?v=example2'
    },
    {
      id: 'v3',
      title: 'Building a Full-Stack App in 10 Minutes',
      description: 'Watch as we create a complete application from scratch using AI',
      thumbnail: '/videos/fullstack-demo-thumb.jpg',
      duration: '10:15',
      category: 'code-generation',
      difficulty: 'intermediate',
      views: 7891,
      url: 'https://www.youtube.com/watch?v=example3'
    }
  ];

  useEffect(() => {
    // Load contextual suggestions based on current page
    loadContextualSuggestions();
  }, []);

  useEffect(() => {
    if (searchQuery.length > 2) {
      performSearch(searchQuery);
    } else {
      setSearchResults([]);
    }
  }, [searchQuery]);

  const loadContextualSuggestions = async () => {
    // In production, this would analyze current page context
    const contextualSuggestions = popularArticles.slice(0, 3);
    setSuggestions(contextualSuggestions);
  };

  const performSearch = async (query: string) => {
    setLoading(true);
    try {
      // Simulate search API call
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const results = popularArticles.filter(article => 
        article.title.toLowerCase().includes(query.toLowerCase()) ||
        article.description.toLowerCase().includes(query.toLowerCase()) ||
        article.tags.some(tag => tag.toLowerCase().includes(query.toLowerCase()))
      );
      
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      toast.error('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleArticleClick = (article: HelpArticle) => {
    setSelectedArticle(article);
    // Track article view
    trackArticleView(article.id);
  };

  const trackArticleView = async (articleId: string) => {
    try {
      await fetch('/api/help/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          event: 'article_viewed', 
          articleId,
          timestamp: new Date().toISOString()
        })
      });
    } catch (error) {
      console.error('Failed to track article view:', error);
    }
  };

  const handleHelpfulVote = async (articleId: string, helpful: boolean) => {
    try {
      await fetch('/api/help/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, helpful })
      });
      
      toast.success('Thank you for your feedback!');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      toast.error('Failed to submit feedback');
    }
  };

  const copyCodeSnippet = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard!');
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsOpen(true)}
          className="rounded-full w-14 h-14 bg-blue-600 hover:bg-blue-700 shadow-lg"
        >
          <HelpCircle className="w-6 h-6" />
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setIsOpen(false)}>
      <div 
        className="fixed right-0 top-0 h-full w-full max-w-4xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        ref={helpRef}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-8 h-8" />
              <div>
                <h2 className="text-2xl font-bold">Help Center</h2>
                <p className="text-blue-100">Get help and learn Recoder.xyz</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(false)}
              className="text-white hover:bg-white/20"
            >
              <X className="w-5 h-5" />
            </Button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full">
            <div className="border-b px-6 py-2">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="search">Search</TabsTrigger>
                <TabsTrigger value="categories">Browse</TabsTrigger>
                <TabsTrigger value="videos">Videos</TabsTrigger>
                <TabsTrigger value="contact">Contact</TabsTrigger>
              </TabsList>
            </div>

            <div className="h-[calc(100vh-180px)] overflow-y-auto">
              <TabsContent value="search" className="p-6 space-y-6">
                {/* Search */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <Input
                    placeholder="Search help articles, tutorials, and FAQs..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 pr-4 py-3 text-lg"
                  />
                </div>

                {/* Search Results */}
                {searchQuery ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">
                      Search Results {searchResults.length > 0 && `(${searchResults.length})`}
                    </h3>
                    {loading ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                      </div>
                    ) : searchResults.length > 0 ? (
                      <div className="space-y-3">
                        {searchResults.map((article) => (
                          <Card 
                            key={article.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleArticleClick(article)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold text-lg mb-2">{article.title}</h4>
                                  <p className="text-gray-600 mb-3">{article.description}</p>
                                  <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <Badge variant="outline">{article.difficulty}</Badge>
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-4 h-4" />
                                      {article.readTime} min read
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <ThumbsUp className="w-4 h-4" />
                                      {article.helpful}
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <Book className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">No results found for "{searchQuery}"</p>
                        <p className="text-sm text-gray-400 mt-2">Try different keywords or browse categories</p>
                      </div>
                    )}
                  </div>
                ) : (
                  /* Suggestions and Popular Articles */
                  <div className="space-y-8">
                    {/* Contextual Suggestions */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Lightbulb className="w-5 h-5 text-yellow-500" />
                        Suggested for You
                      </h3>
                      <div className="space-y-3">
                        {suggestions.map((article) => (
                          <Card 
                            key={article.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleArticleClick(article)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <h4 className="font-medium">{article.title}</h4>
                                  <p className="text-sm text-gray-600 mt-1">{article.description}</p>
                                  <div className="flex items-center gap-2 mt-2">
                                    <Badge variant="secondary" className="text-xs">{article.difficulty}</Badge>
                                    <span className="text-xs text-gray-500">{article.readTime} min</span>
                                  </div>
                                </div>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>

                    {/* Popular Articles */}
                    <div>
                      <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        <Star className="w-5 h-5 text-yellow-500" />
                        Popular Articles
                      </h3>
                      <div className="space-y-3">
                        {popularArticles.map((article) => (
                          <Card 
                            key={article.id}
                            className="cursor-pointer hover:shadow-md transition-shadow"
                            onClick={() => handleArticleClick(article)}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <h4 className="font-semibold mb-2">{article.title}</h4>
                                  <p className="text-gray-600 mb-3">{article.description}</p>
                                  <div className="flex items-center gap-3 text-sm text-gray-500">
                                    <Badge variant="outline">{article.difficulty}</Badge>
                                    <div className="flex items-center gap-1">
                                      <Clock className="w-4 h-4" />
                                      {article.readTime} min
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <Users className="w-4 h-4" />
                                      {article.views}
                                    </div>
                                  </div>
                                </div>
                                <ChevronRight className="w-5 h-5 text-gray-400" />
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="categories" className="p-6">
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold">Browse by Category</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {categories.map((category) => (
                      <Card 
                        key={category.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <CardContent className="p-6">
                          <div className="flex items-start gap-4">
                            <div className="p-3 bg-blue-50 rounded-lg">
                              <category.icon className="w-6 h-6 text-blue-600" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-lg mb-2">{category.name}</h4>
                              <p className="text-gray-600 mb-3">{category.description}</p>
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">
                                  {category.articleCount} articles
                                </span>
                                <ChevronRight className="w-4 h-4 text-gray-400" />
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="videos" className="p-6">
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold">Video Tutorials</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {videoTutorials.map((video) => (
                      <Card key={video.id} className="overflow-hidden">
                        <div className="aspect-video bg-gray-100 relative group cursor-pointer">
                          <div className="absolute inset-0 bg-black bg-opacity-40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <PlayCircle className="w-16 h-16 text-white" />
                          </div>
                          <div className="absolute bottom-2 right-2 bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded">
                            {video.duration}
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <h4 className="font-semibold mb-2">{video.title}</h4>
                          <p className="text-gray-600 text-sm mb-3">{video.description}</p>
                          <div className="flex items-center justify-between text-sm text-gray-500">
                            <Badge variant="outline">{video.difficulty}</Badge>
                            <div className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {video.views}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="contact" className="p-6">
                <div className="space-y-6">
                  <h3 className="text-xl font-semibold">Get in Touch</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <MessageSquare className="w-5 h-5" />
                          Live Chat Support
                        </CardTitle>
                        <CardDescription>
                          Get instant help from our support team
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button className="w-full">
                          Start Live Chat
                        </Button>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Users className="w-5 h-5" />
                          Community Forum
                        </CardTitle>
                        <CardDescription>
                          Join discussions with other developers
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button variant="outline" className="w-full">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Visit Forum
                        </Button>
                      </CardContent>
                    </Card>

                    <Card className="md:col-span-2">
                      <CardHeader>
                        <CardTitle>Submit a Support Request</CardTitle>
                        <CardDescription>
                          Can't find what you're looking for? Send us a message.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Button variant="outline" className="w-full">
                          Create Support Ticket
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Article Modal */}
        {selectedArticle && (
          <div className="absolute inset-0 bg-white z-10 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedArticle(null)}
                  className="flex items-center gap-2"
                >
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  Back
                </Button>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHelpfulVote(selectedArticle.id, true)}
                  >
                    <ThumbsUp className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleHelpfulVote(selectedArticle.id, false)}
                  >
                    <ThumbsDown className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="prose max-w-none">
                <div className="mb-6">
                  <h1 className="text-3xl font-bold mb-4">{selectedArticle.title}</h1>
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
                    <Badge variant="outline">{selectedArticle.difficulty}</Badge>
                    <div className="flex items-center gap-1">
                      <Clock className="w-4 h-4" />
                      {selectedArticle.readTime} min read
                    </div>
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="w-4 h-4" />
                      {selectedArticle.helpful} helpful
                    </div>
                    <span>Updated {selectedArticle.lastUpdated}</span>
                  </div>
                </div>

                <div 
                  className="prose-lg"
                  dangerouslySetInnerHTML={{ __html: selectedArticle.content.replace(/\n/g, '<br/>') }}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}