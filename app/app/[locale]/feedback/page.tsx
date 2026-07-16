'use client'

import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { MessageSquare, Lightbulb, Bug, Star, ThumbsUp, TrendingUp, Calendar, Filter, Search, Send } from 'lucide-react'

export default function FeedbackCenterPage() {
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')

  const feedbackCategories = [
    { id: 'feature', name: 'Feature Request', icon: Lightbulb, color: 'bg-yellow-500' },
    { id: 'bug', name: 'Bug Report', icon: Bug, color: 'bg-red-500' },
    { id: 'improvement', name: 'Improvement', icon: TrendingUp, color: 'bg-blue-500' },
    { id: 'general', name: 'General Feedback', icon: MessageSquare, color: 'bg-green-500' }
  ]

  const feedbackItems = [
    {
      id: 1,
      title: 'Real-time collaboration in code editor',
      description: 'Add support for multiple developers to edit code simultaneously',
      category: 'feature',
      votes: 245,
      status: 'in-progress',
      author: 'dev_sarah',
      date: '2024-01-15',
      comments: 12
    },
    {
      id: 2,
      title: 'Dark theme for mobile app',
      description: 'Implement dark mode toggle in the mobile application',
      category: 'feature',
      votes: 189,
      status: 'planned',
      author: 'ui_designer',
      date: '2024-01-14',
      comments: 8
    },
    {
      id: 3,
      title: 'Code autocomplete performance issue',
      description: 'Autocomplete is slow when working with large TypeScript projects',
      category: 'bug',
      votes: 156,
      status: 'investigating',
      author: 'backend_dev',
      date: '2024-01-13',
      comments: 15
    },
    {
      id: 4,
      title: 'Enhanced AI code suggestions',
      description: 'Improve AI suggestions for better context awareness',
      category: 'improvement',
      votes: 134,
      status: 'completed',
      author: 'ai_enthusiast',
      date: '2024-01-12',
      comments: 6
    },
    {
      id: 5,
      title: 'Better documentation search',
      description: 'Add fuzzy search and better categorization to docs',
      category: 'improvement',
      votes: 98,
      status: 'planned',
      author: 'docs_writer',
      date: '2024-01-11',
      comments: 4
    }
  ]

  const statusColors = {
    'planned': 'bg-blue-100 text-blue-800',
    'in-progress': 'bg-yellow-100 text-yellow-800',
    'investigating': 'bg-purple-100 text-purple-800',
    'completed': 'bg-green-100 text-green-800'
  }

  const filteredFeedback = feedbackItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <SiteHeader />
      {/* Hero Section */}
      <section className="relative py-20 px-6">
        <div className="max-w-7xl mx-auto text-center">
          <div className="flex items-center justify-center mb-6">
            <MessageSquare className="h-12 w-12 text-blue-600 mr-3" />
            <h1 className="text-5xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              Feedback Center
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
            Your voice shapes the future of Recoder. Share feedback, vote on features, and help us build the development platform of tomorrow.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
              <Lightbulb className="mr-2 h-5 w-5" />
              Submit Feedback
            </Button>
            <Button variant="outline" size="lg">
              <Star className="mr-2 h-5 w-5" />
              View Roadmap
            </Button>
          </div>
        </div>
      </section>

      {/* Feedback Categories */}
      <section className="py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Feedback Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {feedbackCategories.map((category) => {
              const Icon = category.icon
              return (
                <Card key={category.id} className="hover:shadow-lg transition-all duration-300 cursor-pointer group">
                  <CardHeader className="text-center">
                    <div className={`${category.color} w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <CardTitle className="text-xl">{category.name}</CardTitle>
                    <CardDescription>
                      {category.id === 'feature' && 'Suggest new features and capabilities'}
                      {category.id === 'bug' && 'Report bugs and technical issues'}
                      {category.id === 'improvement' && 'Suggest improvements to existing features'}
                      {category.id === 'general' && 'General thoughts and suggestions'}
                    </CardDescription>
                  </CardHeader>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Feedback Board */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8">
            <h2 className="text-3xl font-bold mb-4 lg:mb-0">Community Feedback</h2>
            <div className="flex flex-wrap gap-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search feedback..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
              <select 
                value={selectedCategory} 
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-48 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Categories</option>
                {feedbackCategories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value)}
                className="w-48 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Sort by</option>
                <option value="recent">Most Recent</option>
                <option value="votes">Most Voted</option>
                <option value="comments">Most Discussed</option>
              </select>
            </div>
          </div>

          <div className="space-y-6">
            {filteredFeedback.map((item) => {
              const category = feedbackCategories.find(cat => cat.id === item.category)
              const CategoryIcon = category?.icon || MessageSquare
              
              return (
                <Card key={item.id} className="hover:shadow-lg transition-all duration-300">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`${category?.color} w-10 h-10 rounded-full flex items-center justify-center`}>
                            <CategoryIcon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold">{item.title}</h3>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              <span>by {item.author}</span>
                              <span>•</span>
                              <Calendar className="h-4 w-4" />
                              <span>{item.date}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-gray-600 mb-4">{item.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <Button variant="outline" size="sm" className="flex items-center gap-2">
                              <ThumbsUp className="h-4 w-4" />
                              <span>{item.votes}</span>
                            </Button>
                            <Button variant="ghost" size="sm" className="flex items-center gap-2">
                              <MessageSquare className="h-4 w-4" />
                              <span>{item.comments} comments</span>
                            </Button>
                          </div>
                          <Badge className={statusColors[item.status as keyof typeof statusColors]}>
                            {item.status.charAt(0).toUpperCase() + item.status.slice(1).replace('-', ' ')}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      </section>

      {/* Submit Feedback Form */}
      <section className="py-16 px-6 bg-gradient-to-r from-orange-50 to-purple-50">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Submit Your Feedback</CardTitle>
              <CardDescription>
                Help us improve Recoder by sharing your thoughts, ideas, and suggestions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium mb-2">Feedback Type</label>
                  <select className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                    <option value="">Select category</option>
                    {feedbackCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Your Email</label>
                  <Input placeholder="your.email@example.com" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Title</label>
                <Input placeholder="Brief description of your feedback" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description</label>
                <textarea 
                  placeholder="Provide detailed information about your feedback, including use cases, expected behavior, or any relevant context..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical"
                />
              </div>
              <div className="flex justify-end">
                <Button size="lg" className="bg-blue-600 hover:bg-blue-700">
                  <Send className="mr-2 h-5 w-5" />
                  Submit Feedback
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Community Stats */}
      <section className="py-16 px-6 bg-white">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Community Impact</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-4xl font-bold text-blue-600 mb-2">1,247</div>
              <div className="text-gray-600">Total Feedback</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600 mb-2">89</div>
              <div className="text-gray-600">Features Implemented</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-purple-600 mb-2">312</div>
              <div className="text-gray-600">Active Contributors</div>
            </div>
            <div className="text-center">
              <div className="text-4xl font-bold text-orange-600 mb-2">24h</div>
              <div className="text-gray-600">Avg Response Time</div>
            </div>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  )
}
