'use client'

import React, { useState, useEffect } from 'react'
import { 
  HelpCircle, 
  Search, 
  BookOpen, 
  Video, 
  MessageCircle, 
  ExternalLink,
  ChevronRight,
  Star,
  Clock,
  Users,
  Lightbulb,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

interface HelpArticle {
  id: string
  title: string
  description: string
  category: string
  type: 'article' | 'video' | 'tutorial'
  readTime?: string
  rating: number
  popular: boolean
  tags: string[]
  content?: string
  videoUrl?: string
}

interface HelpCategory {
  id: string
  name: string
  icon: React.ReactNode
  description: string
  articleCount: number
}

interface InAppHelpProps {
  isOpen: boolean
  onClose: () => void
  context?: string // Current page/feature context for contextual help
  searchQuery?: string
}

const helpCategories: HelpCategory[] = [
  {
    id: 'getting-started',
    name: 'Getting Started',
    icon: <Lightbulb className="w-5 h-5" />,
    description: 'Learn the basics of Recoder.xyz',
    articleCount: 12
  },
  {
    id: 'project-management',
    name: 'Project Management',
    icon: <BookOpen className="w-5 h-5" />,
    description: 'Create and manage your projects',
    articleCount: 8
  },
  {
    id: 'ai-features',
    name: 'AI Features',
    icon: <Star className="w-5 h-5" />,
    description: 'AI-powered development tools',
    articleCount: 15
  },
  {
    id: 'collaboration',
    name: 'Collaboration',
    icon: <Users className="w-5 h-5" />,
    description: 'Work together with your team',
    articleCount: 6
  },
  {
    id: 'deployment',
    name: 'Deployment',
    icon: <ExternalLink className="w-5 h-5" />,
    description: 'Deploy your applications',
    articleCount: 10
  },
  {
    id: 'troubleshooting',
    name: 'Troubleshooting',
    icon: <HelpCircle className="w-5 h-5" />,
    description: 'Common issues and solutions',
    articleCount: 20
  }
]

const helpArticles: HelpArticle[] = [
  {
    id: 'create-first-project',
    title: 'Creating Your First Project',
    description: 'Step-by-step guide to creating your first project in Recoder.xyz',
    category: 'getting-started',
    type: 'tutorial',
    readTime: '5 min',
    rating: 4.8,
    popular: true,
    tags: ['beginner', 'project', 'setup']
  },
  {
    id: 'ai-code-generation',
    title: 'AI Code Generation Basics',
    description: 'Learn how to use AI to generate high-quality code',
    category: 'ai-features',
    type: 'video',
    readTime: '8 min',
    rating: 4.9,
    popular: true,
    tags: ['ai', 'code-generation', 'automation']
  },
  {
    id: 'deployment-guide',
    title: 'Deploying to Production',
    description: 'Complete guide to deploying your applications',
    category: 'deployment',
    type: 'article',
    readTime: '12 min',
    rating: 4.7,
    popular: true,
    tags: ['deployment', 'production', 'hosting']
  },
  {
    id: 'team-collaboration',
    title: 'Setting Up Team Collaboration',
    description: 'Configure team settings and permissions',
    category: 'collaboration',
    type: 'tutorial',
    readTime: '6 min',
    rating: 4.6,
    popular: false,
    tags: ['team', 'collaboration', 'permissions']
  },
  {
    id: 'project-templates',
    title: 'Using Project Templates',
    description: 'Get started quickly with pre-built templates',
    category: 'project-management',
    type: 'article',
    readTime: '4 min',
    rating: 4.5,
    popular: true,
    tags: ['templates', 'quick-start', 'productivity']
  },
  {
    id: 'debugging-common-issues',
    title: 'Debugging Common Issues',
    description: 'Solutions to frequently encountered problems',
    category: 'troubleshooting',
    type: 'article',
    readTime: '15 min',
    rating: 4.4,
    popular: false,
    tags: ['debugging', 'troubleshooting', 'solutions']
  }
]

export function InAppHelp({ isOpen, onClose, context, searchQuery: initialSearchQuery }: InAppHelpProps) {
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || '')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedArticle, setSelectedArticle] = useState<HelpArticle | null>(null)
  const [filteredArticles, setFilteredArticles] = useState(helpArticles)

  useEffect(() => {
    if (searchQuery) {
      const filtered = helpArticles.filter(article =>
        article.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
      )
      setFilteredArticles(filtered)
    } else if (selectedCategory) {
      setFilteredArticles(helpArticles.filter(article => article.category === selectedCategory))
    } else {
      setFilteredArticles(helpArticles)
    }
  }, [searchQuery, selectedCategory])

  // Contextual help suggestions based on current page
  const getContextualSuggestions = () => {
    if (context === 'project-creation') {
      return helpArticles.filter(article => article.tags.includes('project') || article.tags.includes('setup'))
    }
    if (context === 'ai-features') {
      return helpArticles.filter(article => article.category === 'ai-features')
    }
    if (context === 'deployment') {
      return helpArticles.filter(article => article.category === 'deployment')
    }
    return helpArticles.filter(article => article.popular).slice(0, 3)
  }

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCategory(selectedCategory === categoryId ? null : categoryId)
    setSelectedArticle(null)
  }

  const handleArticleSelect = (article: HelpArticle) => {
    setSelectedArticle(article)
  }

  const handleBackToList = () => {
    setSelectedArticle(null)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <HelpCircle className="w-6 h-6 text-blue-600" />
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Help Center
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-4 h-4" />
          </Button>
        </div>

        <div className="flex h-[calc(90vh-120px)]">
          {/* Sidebar */}
          <div className="w-80 border-r border-gray-200 dark:border-gray-700 p-6 overflow-y-auto">
            {/* Search */}
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <Input
                  placeholder="Search help articles..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Contextual Suggestions */}
            {context && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  Suggested for you
                </h3>
                <div className="space-y-2">
                  {getContextualSuggestions().map((article) => (
                    <button
                      key={article.id}
                      onClick={() => handleArticleSelect(article)}
                      className="w-full text-left p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {article.type === 'video' && <Video className="w-3 h-3 text-blue-600" />}
                        {article.type === 'article' && <BookOpen className="w-3 h-3 text-blue-600" />}
                        {article.type === 'tutorial' && <Lightbulb className="w-3 h-3 text-blue-600" />}
                        <span className="text-xs font-medium text-blue-600">
                          {article.type}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {article.title}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {article.readTime}
                      </p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Categories */}
            <div>
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                Browse by category
              </h3>
              <div className="space-y-1">
                {helpCategories.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => handleCategorySelect(category.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedCategory === category.id
                        ? 'bg-gray-100 dark:bg-gray-800'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {category.icon}
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {category.name}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {category.articleCount} articles
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            {selectedArticle ? (
              /* Article View */
              <div>
                <div className="mb-6">
                  <Button variant="ghost" onClick={handleBackToList} className="mb-4">
                    ← Back to articles
                  </Button>
                  <div className="flex items-center gap-2 mb-2">
                    {selectedArticle.type === 'video' && <Video className="w-4 h-4 text-blue-600" />}
                    {selectedArticle.type === 'article' && <BookOpen className="w-4 h-4 text-blue-600" />}
                    {selectedArticle.type === 'tutorial' && <Lightbulb className="w-4 h-4 text-blue-600" />}
                    <Badge variant="secondary">{selectedArticle.type}</Badge>
                    {selectedArticle.popular && <Badge variant="default">Popular</Badge>}
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                    {selectedArticle.title}
                  </h1>
                  <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {selectedArticle.readTime}
                    </div>
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 fill-current text-yellow-500" />
                      {selectedArticle.rating}
                    </div>
                  </div>
                </div>

                {/* Article Content */}
                <div className="prose dark:prose-invert max-w-none">
                  <p className="text-lg text-gray-700 dark:text-gray-300 mb-6">
                    {selectedArticle.description}
                  </p>
                  
                  {selectedArticle.type === 'video' && selectedArticle.videoUrl && (
                    <div className="mb-6">
                      <div className="aspect-video bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center">
                        <Video className="w-12 h-12 text-gray-400" />
                        <span className="ml-2 text-gray-600 dark:text-gray-400">Video Player</span>
                      </div>
                    </div>
                  )}

                  {/* Mock article content */}
                  <div className="space-y-4">
                    <h3 className="text-xl font-semibold">Getting Started</h3>
                    <p>This comprehensive guide will walk you through the process step by step.</p>
                    
                    <h4 className="text-lg font-semibold">Prerequisites</h4>
                    <ul>
                      <li>Basic understanding of web development</li>
                      <li>A Recoder.xyz account</li>
                      <li>Access to the platform</li>
                    </ul>

                    <h4 className="text-lg font-semibold">Step-by-step Instructions</h4>
                    <ol>
                      <li>Navigate to the main dashboard</li>
                      <li>Click on "Create New Project"</li>
                      <li>Select your preferred template or start from scratch</li>
                      <li>Configure your project settings</li>
                      <li>Begin developing with AI assistance</li>
                    </ol>

                    <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                      <h5 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">💡 Pro Tip</h5>
                      <p className="text-blue-700 dark:text-blue-300">
                        Use our AI suggestions to speed up your development process significantly.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Tags */}
                <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Tags</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedArticle.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* Article List */
              <div>
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedCategory 
                      ? helpCategories.find(c => c.id === selectedCategory)?.name 
                      : searchQuery 
                        ? `Search results for "${searchQuery}"` 
                        : 'All Articles'
                    }
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {filteredArticles.length} articles found
                  </p>
                </div>

                <div className="grid gap-4">
                  {filteredArticles.map((article) => (
                    <Card 
                      key={article.id} 
                      className="cursor-pointer hover:shadow-md transition-shadow"
                      onClick={() => handleArticleSelect(article)}
                    >
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {article.type === 'video' && <Video className="w-4 h-4 text-blue-600" />}
                              {article.type === 'article' && <BookOpen className="w-4 h-4 text-blue-600" />}
                              {article.type === 'tutorial' && <Lightbulb className="w-4 h-4 text-blue-600" />}
                              <Badge variant="secondary" className="text-xs">
                                {article.type}
                              </Badge>
                              {article.popular && <Badge variant="default" className="text-xs">Popular</Badge>}
                            </div>
                            <CardTitle className="text-base">{article.title}</CardTitle>
                          </div>
                          <ChevronRight className="w-4 h-4 text-gray-400 mt-1" />
                        </div>
                      </CardHeader>
                      <CardContent>
                        <CardDescription className="mb-3">
                          {article.description}
                        </CardDescription>
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                          <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {article.readTime}
                            </div>
                            <div className="flex items-center gap-1">
                              <Star className="w-3 h-3 fill-current text-yellow-500" />
                              {article.rating}
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {article.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Contact Support */}
                <div className="mt-8 p-6 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center gap-3 mb-3">
                    <MessageCircle className="w-5 h-5 text-blue-600" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                      Still need help?
                    </h4>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Can't find what you're looking for? Our support team is here to help.
                  </p>
                  <div className="flex gap-3">
                    <Button size="sm" variant="outline">
                      Contact Support
                    </Button>
                    <Button size="sm" variant="outline">
                      Join Community
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default InAppHelp
