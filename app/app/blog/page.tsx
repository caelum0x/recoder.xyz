'use client';

import Link from 'next/link';
import { Calendar, Clock, User, ArrowRight, ChevronRight, Tag } from 'lucide-react';

export default function BlogPage() {
  const featuredPost = {
    id: 1,
    title: "The Future of AI-Powered Development: How Recoder is Revolutionizing Code Generation",
    excerpt: "Explore how advanced AI models are transforming the way developers build applications, from concept to deployment in minutes rather than weeks.",
    author: "Recoder Team",
    date: "December 15, 2024",
    readTime: "8 min read",
    category: "AI Development",
    image: "/api/placeholder/800/400",
    slug: "future-ai-powered-development",
    featured: true
  };

  const blogPosts = [
    {
      id: 2,
      title: "Building Full-Stack Applications with Natural Language",
      excerpt: "Learn how to create complete web applications using nothing but natural language descriptions, leveraging the power of modern AI.",
      author: "Sarah Chen",
      date: "December 12, 2024",
      readTime: "6 min read",
      category: "Tutorial",
      image: "/api/placeholder/600/300",
      slug: "building-fullstack-natural-language"
    },
    {
      id: 3,
      title: "Comparing AI Code Generators: Recoder vs. The Competition",
      excerpt: "An in-depth comparison of leading AI development platforms and what makes Recoder unique in the rapidly evolving landscape.",
      author: "David Rodriguez",
      date: "December 10, 2024",
      readTime: "12 min read",
      category: "Analysis",
      image: "/api/placeholder/600/300",
      slug: "ai-code-generators-comparison"
    },
    {
      id: 4,
      title: "Best Practices for Prompt Engineering in Code Generation",
      excerpt: "Master the art of writing effective prompts to get the most out of AI-powered development tools and improve your coding workflow.",
      author: "Emily Parker",
      date: "December 8, 2024",
      readTime: "10 min read",
      category: "Best Practices",
      image: "/api/placeholder/600/300",
      slug: "prompt-engineering-best-practices"
    },
    {
      id: 5,
      title: "Security Considerations in AI-Generated Code",
      excerpt: "Understanding security implications of AI-generated code and implementing best practices to ensure your applications remain secure.",
      author: "Michael Foster",
      date: "December 5, 2024",
      readTime: "7 min read",
      category: "Security",
      image: "/api/placeholder/600/300",
      slug: "security-ai-generated-code"
    },
    {
      id: 6,
      title: "Case Study: From Idea to MVP in 30 Minutes",
      excerpt: "Follow along as we build a complete social media analytics dashboard from scratch using Recoder's AI-powered development platform.",
      author: "Alex Thompson",
      date: "December 3, 2024",
      readTime: "15 min read",
      category: "Case Study",
      image: "/api/placeholder/600/300",
      slug: "idea-to-mvp-30-minutes"
    },
    {
      id: 7,
      title: "The Evolution of Developer Tools: From IDEs to AI Assistants",
      excerpt: "A retrospective look at how developer tools have evolved and predictions for the future of AI-assisted development.",
      author: "Jennifer Liu",
      date: "November 30, 2024",
      readTime: "9 min read",
      category: "Industry Insights",
      image: "/api/placeholder/600/300",
      slug: "evolution-developer-tools"
    }
  ];

  const categories = [
    "All Posts",
    "AI Development", 
    "Tutorial",
    "Best Practices",
    "Case Study",
    "Security",
    "Industry Insights",
    "Analysis"
  ];

  const getCategoryColor = (category: string) => {
    const colors: { [key: string]: string } = {
      "AI Development": "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
      "Tutorial": "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
      "Best Practices": "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300",
      "Case Study": "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300",
      "Security": "bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300",
      "Industry Insights": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300",
      "Analysis": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300"
    };
    return colors[category] || "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
              Recoder Blog
            </h1>
            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              Insights, tutorials, and industry analysis on the future of AI-powered development.
              Stay updated with the latest trends and best practices.
            </p>
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap justify-center gap-2 mb-12">
            {categories.map((category) => (
              <button
                key={category}
                className="px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 
                         bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700
                         hover:border-blue-300 dark:hover:border-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20
                         focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Post */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="absolute top-4 left-4 z-10">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-600 text-white">
                <Tag className="w-3 h-3 mr-1" />
                Featured
              </span>
            </div>
            
            <div className="lg:flex">
              <div className="lg:w-1/2">
                <div className="h-64 lg:h-full bg-gradient-to-br from-blue-500 to-purple-600 relative">
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="absolute bottom-4 left-4 text-white">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(featuredPost.category)}`}>
                      {featuredPost.category}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="lg:w-1/2 p-8 lg:p-12">
                <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  {featuredPost.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                  {featuredPost.excerpt}
                </p>
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="flex items-center">
                      <User className="w-4 h-4 mr-1" />
                      {featuredPost.author}
                    </div>
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-1" />
                      {featuredPost.date}
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-4 h-4 mr-1" />
                      {featuredPost.readTime}
                    </div>
                  </div>
                </div>
                
                <Link 
                  href={`/blog/${featuredPost.slug}`}
                  className="inline-flex items-center px-6 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105"
                >
                  Read Article
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Grid */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white">Latest Articles</h2>
            <Link 
              href="/blog/all"
              className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
            >
              View All Posts
              <ChevronRight className="ml-1 w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post) => (
              <article 
                key={post.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-600 relative">
                  <div className="absolute top-3 right-3">
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(post.category)}`}>
                      {post.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-4">
                    <div className="flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      {post.author}
                    </div>
                    <div className="flex items-center">
                      <Clock className="w-3 h-3 mr-1" />
                      {post.readTime}
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-500 dark:text-gray-400">{post.date}</span>
                    <Link 
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                    >
                      Read More
                      <ArrowRight className="ml-1 w-3 h-3" />
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Newsletter Section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-center text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Stay Updated with Recoder
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Get the latest insights on AI development, tutorials, and industry analysis delivered to your inbox.
            </p>
            
            <div className="max-w-md mx-auto flex gap-4">
              <input
                type="email"
                placeholder="Enter your email"
                className="flex-1 px-4 py-3 rounded-xl text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-blue-600"
              />
              <button className="px-6 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                Subscribe
              </button>
            </div>
            
            <p className="text-sm opacity-75 mt-4">
              No spam, unsubscribe at any time. Read our privacy policy.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
