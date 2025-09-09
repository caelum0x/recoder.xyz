'use client'

import React, { useState, useEffect, useMemo } from 'react'
import { 
  Search, 
  Filter, 
  ArrowUpDown, 
  Tag, 
  Clock, 
  Star, 
  BookOpen,
  Video,
  Lightbulb,
  Zap,
  Users,
  Settings,
  TrendingUp,
  X
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface SearchableContent {
  id: string
  title: string
  description: string
  content: string
  type: 'article' | 'video' | 'tutorial' | 'faq' | 'guide' | 'api-doc'
  category: string
  tags: string[]
  author?: string
  lastUpdated: Date
  readTime?: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  popularity: number
  rating: number
  searchableText: string // Computed field for search
}

interface SearchFilters {
  types: string[]
  categories: string[]
  tags: string[]
  difficulty: string[]
  dateRange: 'all' | 'week' | 'month' | 'year'
  sortBy: 'relevance' | 'popularity' | 'date' | 'rating'
  sortOrder: 'asc' | 'desc'
}

interface SearchSuggestion {
  text: string
  type: 'query' | 'category' | 'tag'
  count?: number
}

interface HelpSearchProps {
  onResultSelect?: (content: SearchableContent) => void
  placeholder?: string
  showFilters?: boolean
  maxResults?: number
}

// Mock searchable content data
const searchableContent: SearchableContent[] = [
  {
    id: 'getting-started-guide',
    title: 'Getting Started with Recoder.xyz',
    description: 'Complete guide to setting up your first project',
    content: 'Welcome to Recoder.xyz! This comprehensive guide will walk you through creating your first project, setting up your development environment, and deploying your application. Learn about our AI-powered features, collaboration tools, and best practices for modern development.',
    type: 'guide',
    category: 'getting-started',
    tags: ['beginner', 'setup', 'project', 'deployment'],
    author: 'Recoder Team',
    lastUpdated: new Date('2024-01-15'),
    readTime: '10 min',
    difficulty: 'beginner',
    popularity: 95,
    rating: 4.8,
    searchableText: 'getting started recoder.xyz first project setup development environment deployment ai-powered features collaboration tools best practices modern development'
  },
  {
    id: 'ai-code-generation',
    title: 'AI Code Generation Techniques',
    description: 'Master the art of AI-assisted coding',
    content: 'Discover how to leverage artificial intelligence to accelerate your development workflow. Learn prompting techniques, code completion, refactoring, and automated testing with our advanced AI assistant.',
    type: 'tutorial',
    category: 'ai-features',
    tags: ['ai', 'code-generation', 'automation', 'productivity'],
    author: 'AI Research Team',
    lastUpdated: new Date('2024-01-20'),
    readTime: '15 min',
    difficulty: 'intermediate',
    popularity: 88,
    rating: 4.9,
    searchableText: 'artificial intelligence ai code generation prompting techniques code completion refactoring automated testing ai assistant development workflow'
  },
  {
    id: 'deployment-strategies',
    title: 'Modern Deployment Strategies',
    description: 'Deploy with confidence using best practices',
    content: 'Learn about various deployment strategies including blue-green deployments, canary releases, and continuous deployment. Understand how to set up CI/CD pipelines, manage environments, and monitor your applications in production.',
    type: 'article',
    category: 'deployment',
    tags: ['deployment', 'cicd', 'devops', 'production'],
    author: 'DevOps Team',
    lastUpdated: new Date('2024-01-18'),
    readTime: '20 min',
    difficulty: 'advanced',
    popularity: 76,
    rating: 4.7,
    searchableText: 'deployment strategies blue-green canary releases continuous deployment ci/cd pipelines environments monitoring production devops'
  },
  {
    id: 'collaboration-features',
    title: 'Team Collaboration Features',
    description: 'Work better together with real-time collaboration',
    content: 'Explore our collaboration features including real-time editing, code reviews, project sharing, team management, and communication tools. Learn how to set up teams, manage permissions, and coordinate development efforts.',
    type: 'video',
    category: 'collaboration',
    tags: ['collaboration', 'teamwork', 'real-time', 'sharing'],
    author: 'Product Team',
    lastUpdated: new Date('2024-01-22'),
    readTime: '12 min',
    difficulty: 'beginner',
    popularity: 82,
    rating: 4.6,
    searchableText: 'team collaboration real-time editing code reviews project sharing team management communication tools permissions coordination development'
  },
  {
    id: 'api-documentation',
    title: 'Platform API Reference',
    description: 'Complete API documentation for developers',
    content: 'Comprehensive API documentation covering authentication, project management, deployment, user management, and integration endpoints. Includes code examples, error handling, and rate limiting information.',
    type: 'api-doc',
    category: 'api',
    tags: ['api', 'documentation', 'integration', 'development'],
    author: 'Engineering Team',
    lastUpdated: new Date('2024-01-25'),
    difficulty: 'advanced',
    popularity: 65,
    rating: 4.5,
    searchableText: 'api documentation authentication project management deployment user management integration endpoints code examples error handling rate limiting'
  },
  {
    id: 'troubleshooting-common-issues',
    title: 'Troubleshooting Common Issues',
    description: 'Solutions to frequently encountered problems',
    content: 'Find solutions to common issues including build failures, deployment errors, authentication problems, and performance issues. Step-by-step troubleshooting guides with screenshots and code examples.',
    type: 'faq',
    category: 'troubleshooting',
    tags: ['troubleshooting', 'debugging', 'errors', 'solutions'],
    author: 'Support Team',
    lastUpdated: new Date('2024-01-20'),
    readTime: '8 min',
    difficulty: 'intermediate',
    popularity: 90,
    rating: 4.4,
    searchableText: 'troubleshooting common issues build failures deployment errors authentication problems performance issues debugging solutions'
  }
]

const searchSuggestions: SearchSuggestion[] = [
  { text: 'getting started', type: 'query', count: 45 },
  { text: 'ai features', type: 'category', count: 23 },
  { text: 'deployment', type: 'query', count: 34 },
  { text: 'collaboration', type: 'category', count: 18 },
  { text: 'api documentation', type: 'query', count: 27 },
  { text: 'troubleshooting', type: 'tag', count: 56 },
  { text: 'code generation', type: 'query', count: 29 },
  { text: 'team management', type: 'query', count: 15 }
]

const contentTypes = [
  { value: 'article', label: 'Articles', icon: <BookOpen className="w-4 h-4" /> },
  { value: 'video', label: 'Videos', icon: <Video className="w-4 h-4" /> },
  { value: 'tutorial', label: 'Tutorials', icon: <Lightbulb className="w-4 h-4" /> },
  { value: 'guide', label: 'Guides', icon: <Star className="w-4 h-4" /> },
  { value: 'faq', label: 'FAQ', icon: <Users className="w-4 h-4" /> },
  { value: 'api-doc', label: 'API Docs', icon: <Settings className="w-4 h-4" /> }
]

const categories = [
  'getting-started',
  'ai-features',
  'deployment',
  'collaboration',
  'api',
  'troubleshooting',
  'project-management',
  'security'
]

export function HelpSearch({ 
  onResultSelect, 
  placeholder = "Search help articles, guides, and documentation...",
  showFilters = true,
  maxResults = 20
}: HelpSearchProps) {
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<SearchFilters>({
    types: [],
    categories: [],
    tags: [],
    difficulty: [],
    dateRange: 'all',
    sortBy: 'relevance',
    sortOrder: 'desc'
  })
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false)
  const [recentQueries, setRecentQueries] = useState<string[]>([])
  const [isSearching, setIsSearching] = useState(false)

  // Load recent queries from localStorage
  useEffect(() => {
    const saved = JSON.parse(localStorage.getItem('helpSearchQueries') || '[]')
    setRecentQueries(saved.slice(0, 5))
  }, [])

  // Save query to recent searches
  const saveQuery = (searchQuery: string) => {
    if (!searchQuery.trim()) return
    
    const updated = [searchQuery, ...recentQueries.filter(q => q !== searchQuery)].slice(0, 5)
    setRecentQueries(updated)
    localStorage.setItem('helpSearchQueries', JSON.stringify(updated))
  }

  // Perform search with ranking
  const searchResults = useMemo(() => {
    if (!query.trim()) return []

    setIsSearching(true)
    
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0)
    
    let results = searchableContent.map(content => {
      let score = 0
      const searchText = content.searchableText.toLowerCase()
      
      // Title matches (highest weight)
      searchTerms.forEach(term => {
        if (content.title.toLowerCase().includes(term)) {
          score += 100
        }
      })
      
      // Description matches (medium weight)
      searchTerms.forEach(term => {
        if (content.description.toLowerCase().includes(term)) {
          score += 50
        }
      })
      
      // Content matches (lower weight)
      searchTerms.forEach(term => {
        const matches = searchText.split(term).length - 1
        score += matches * 10
      })
      
      // Tag matches (medium weight)
      searchTerms.forEach(term => {
        content.tags.forEach(tag => {
          if (tag.toLowerCase().includes(term)) {
            score += 30
          }
        })
      })
      
      // Boost popular content
      score += content.popularity * 0.1
      score += content.rating * 5
      
      return { ...content, score }
    })

    // Filter results
    results = results.filter(content => {
      if (content.score === 0) return false
      
      if (filters.types.length > 0 && !filters.types.includes(content.type)) {
        return false
      }
      
      if (filters.categories.length > 0 && !filters.categories.includes(content.category)) {
        return false
      }
      
      if (filters.difficulty.length > 0 && !filters.difficulty.includes(content.difficulty)) {
        return false
      }
      
      if (filters.tags.length > 0) {
        const hasTag = filters.tags.some(tag => content.tags.includes(tag))
        if (!hasTag) return false
      }
      
      // Date range filter
      if (filters.dateRange !== 'all') {
        const now = new Date()
        const contentDate = content.lastUpdated
        const daysDiff = (now.getTime() - contentDate.getTime()) / (1000 * 3600 * 24)
        
        switch (filters.dateRange) {
          case 'week':
            if (daysDiff > 7) return false
            break
          case 'month':
            if (daysDiff > 30) return false
            break
          case 'year':
            if (daysDiff > 365) return false
            break
        }
      }
      
      return true
    })

    // Sort results
    results.sort((a, b) => {
      switch (filters.sortBy) {
        case 'relevance':
          return filters.sortOrder === 'desc' ? b.score - a.score : a.score - b.score
        case 'popularity':
          return filters.sortOrder === 'desc' ? b.popularity - a.popularity : a.popularity - b.popularity
        case 'date':
          return filters.sortOrder === 'desc' 
            ? b.lastUpdated.getTime() - a.lastUpdated.getTime()
            : a.lastUpdated.getTime() - b.lastUpdated.getTime()
        case 'rating':
          return filters.sortOrder === 'desc' ? b.rating - a.rating : a.rating - b.rating
        default:
          return b.score - a.score
      }
    })

    setTimeout(() => setIsSearching(false), 300)
    
    return results.slice(0, maxResults)
  }, [query, filters, maxResults])

  // Get filtered suggestions
  const filteredSuggestions = useMemo(() => {
    if (!query.trim()) return searchSuggestions.slice(0, 8)
    
    return searchSuggestions.filter(suggestion =>
      suggestion.text.toLowerCase().includes(query.toLowerCase())
    ).slice(0, 5)
  }, [query])

  const handleSearch = (searchQuery: string) => {
    setQuery(searchQuery)
    saveQuery(searchQuery)
  }

  const clearFilters = () => {
    setFilters({
      types: [],
      categories: [],
      tags: [],
      difficulty: [],
      dateRange: 'all',
      sortBy: 'relevance',
      sortOrder: 'desc'
    })
  }

  const hasActiveFilters = 
    filters.types.length > 0 || 
    filters.categories.length > 0 || 
    filters.tags.length > 0 || 
    filters.difficulty.length > 0 || 
    filters.dateRange !== 'all'

  return (
    <div className="w-full max-w-4xl mx-auto space-y-4">
      {/* Search Input */}
      <div className="relative">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch(query)
              }
            }}
            className="pl-10 pr-4 py-3 text-base"
          />
          {query && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setQuery('')}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0"
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>

        {/* Search Suggestions */}
        {query && filteredSuggestions.length > 0 && (
          <div className="absolute top-full left-0 right-0 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-10 mt-1">
            <div className="p-2">
              <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 px-2">
                Suggestions
              </div>
              {filteredSuggestions.map((suggestion, index) => (
                <button
                  key={index}
                  onClick={() => handleSearch(suggestion.text)}
                  className="w-full text-left px-2 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Search className="w-3 h-3 text-gray-400" />
                    <span className="text-sm">{suggestion.text}</span>
                    {suggestion.count && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        {suggestion.count}
                      </Badge>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Recent Queries */}
      {!query && recentQueries.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600 dark:text-gray-400">Recent:</span>
          {recentQueries.map((recentQuery, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={() => handleSearch(recentQuery)}
              className="text-xs"
            >
              <Clock className="w-3 h-3 mr-1" />
              {recentQuery}
            </Button>
          ))}
        </div>
      )}

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
            className="flex items-center gap-2"
          >
            <Filter className="w-3 h-3" />
            Filters
            {hasActiveFilters && (
              <Badge variant="default" className="text-xs ml-1">
                {filters.types.length + filters.categories.length + filters.tags.length + filters.difficulty.length + (filters.dateRange !== 'all' ? 1 : 0)}
              </Badge>
            )}
          </Button>

          {/* Quick type filters */}
          {contentTypes.map((type) => (
            <Button
              key={type.value}
              variant={filters.types.includes(type.value) ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilters(prev => ({
                  ...prev,
                  types: prev.types.includes(type.value)
                    ? prev.types.filter(t => t !== type.value)
                    : [...prev.types, type.value]
                }))
              }}
              className="flex items-center gap-1"
            >
              {type.icon}
              {type.label}
            </Button>
          ))}

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear all
            </Button>
          )}
        </div>
      )}

      {/* Advanced Filters */}
      {showAdvancedFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Advanced Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Categories */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Categories
                </label>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {categories.map((category) => (
                    <label key={category} className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={filters.categories.includes(category)}
                        onChange={(e) => {
                          setFilters(prev => ({
                            ...prev,
                            categories: e.target.checked
                              ? [...prev.categories, category]
                              : prev.categories.filter(c => c !== category)
                          }))
                        }}
                        className="mr-2"
                      />
                      <span className="capitalize">{category.replace('-', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Difficulty */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Difficulty
                </label>
                <div className="space-y-1">
                  {['beginner', 'intermediate', 'advanced'].map((level) => (
                    <label key={level} className="flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={filters.difficulty.includes(level)}
                        onChange={(e) => {
                          setFilters(prev => ({
                            ...prev,
                            difficulty: e.target.checked
                              ? [...prev.difficulty, level]
                              : prev.difficulty.filter(d => d !== level)
                          }))
                        }}
                        className="mr-2"
                      />
                      <span className="capitalize">{level}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Date Range */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Date Range
                </label>
                <select
                  value={filters.dateRange}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value as any }))}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm"
                >
                  <option value="all">All time</option>
                  <option value="week">Past week</option>
                  <option value="month">Past month</option>
                  <option value="year">Past year</option>
                </select>
              </div>

              {/* Sort */}
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
                  Sort by
                </label>
                <div className="space-y-2">
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value as any }))}
                    className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded text-sm"
                  >
                    <option value="relevance">Relevance</option>
                    <option value="popularity">Popularity</option>
                    <option value="date">Date</option>
                    <option value="rating">Rating</option>
                  </select>
                  <div className="flex gap-2">
                    <Button
                      variant={filters.sortOrder === 'desc' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, sortOrder: 'desc' }))}
                      className="flex-1"
                    >
                      Desc
                    </Button>
                    <Button
                      variant={filters.sortOrder === 'asc' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setFilters(prev => ({ ...prev, sortOrder: 'asc' }))}
                      className="flex-1"
                    >
                      Asc
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search Results */}
      {query && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              {isSearching ? 'Searching...' : `Found ${searchResults.length} results for "${query}"`}
            </div>
            {searchResults.length > 0 && (
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                <ArrowUpDown className="w-3 h-3" />
                Sort by {filters.sortBy}
              </Button>
            )}
          </div>

          <div className="space-y-4">
            {searchResults.map((result) => (
              <Card 
                key={result.id} 
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => onResultSelect?.(result)}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {contentTypes.find(t => t.value === result.type)?.icon}
                        <Badge variant="secondary" className="text-xs">
                          {result.type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {result.difficulty}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-current text-yellow-500" />
                          <span className="text-xs text-gray-600 dark:text-gray-400">
                            {result.rating}
                          </span>
                        </div>
                      </div>
                      <CardTitle className="text-lg">{result.title}</CardTitle>
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {result.readTime && (
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {result.readTime}
                        </div>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-3">
                    {result.description}
                  </CardDescription>
                  <div className="flex items-center justify-between">
                    <div className="flex flex-wrap gap-1">
                      {result.tags.slice(0, 3).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          <Tag className="w-2 h-2 mr-1" />
                          {tag}
                        </Badge>
                      ))}
                      {result.tags.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{result.tags.length - 3} more
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                      <TrendingUp className="w-3 h-3" />
                      {result.popularity}% helpful
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {searchResults.length === 0 && !isSearching && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                No results found
              </h3>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                Try adjusting your search terms or filters.
              </p>
              <div className="flex gap-2 justify-center">
                <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                  Clear search
                </Button>
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset filters
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default HelpSearch
