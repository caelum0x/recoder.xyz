'use client';

import Link from 'next/link';
import { Calendar, Clock, User, ArrowRight, ChevronRight, Tag, Terminal } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center space-x-2 group">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </Link>
          
          <nav className="flex items-center space-x-8">
            <Link href="/docs" className="text-sm text-gray-400 hover:text-white transition-colors">
              Docs
            </Link>
            <Link href="/pricing" className="text-sm text-gray-400 hover:text-white transition-colors">
              Pricing
            </Link>
            <Link href="/blog" className="text-sm text-white">
              Blog
            </Link>
            <Link 
              href="/auth/signin" 
              className="px-4 py-2 text-sm bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent mb-6">
              Recoder Blog
            </h1>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
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
                         bg-white/5 border border-white/10
                         hover:border-orange-500/50 hover:bg-orange-500/10
                         focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 focus:ring-offset-black"
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
          <div className="relative bg-black/50 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-xl">
            <div className="absolute top-4 left-4 z-10">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gradient-to-r from-orange-500 to-purple-600 text-white">
                <Tag className="w-3 h-3 mr-1" />
                Featured
              </span>
            </div>
            
            <div className="lg:flex">
              <div className="lg:w-1/2">
                <div className="h-64 lg:h-full bg-gradient-to-br from-orange-500 to-purple-600 relative">
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="absolute bottom-4 left-4">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-black/50 text-white border border-white/20">
                      {featuredPost.category}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="lg:w-1/2 p-8 lg:p-12">
                <h2 className="text-2xl lg:text-3xl font-bold text-white mb-4">
                  {featuredPost.title}
                </h2>
                <p className="text-gray-300 mb-6 text-lg">
                  {featuredPost.excerpt}
                </p>
                
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center space-x-4 text-sm text-gray-400">
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
                  className="inline-flex items-center px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-purple-600 text-white font-medium hover:from-orange-600 hover:to-purple-700 transition-all duration-200"
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
            <h2 className="text-3xl font-bold text-white">Latest Articles</h2>
            <Link 
              href="/blog/all"
              className="inline-flex items-center text-orange-500 hover:text-orange-400 font-medium"
            >
              View All Posts
              <ChevronRight className="ml-1 w-4 h-4" />
            </Link>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {blogPosts.map((post) => (
              <article 
                key={post.id}
                className="bg-black/50 border border-white/10 rounded-xl overflow-hidden hover:border-orange-500/50 transition-all duration-300 backdrop-blur-xl"
              >
                <div className="h-48 bg-gradient-to-br from-orange-500/20 to-purple-600/20 relative border-b border-white/10">
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-black/50 text-white border border-white/20">
                      {post.category}
                    </span>
                  </div>
                </div>
                
                <div className="p-6">
                  <h3 className="text-xl font-bold text-white mb-3 line-clamp-2">
                    {post.title}
                  </h3>
                  <p className="text-gray-300 mb-4 line-clamp-3">
                    {post.excerpt}
                  </p>
                  
                  <div className="flex items-center justify-between text-sm text-gray-400 mb-4">
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
                    <span className="text-sm text-gray-500">{post.date}</span>
                    <Link 
                      href={`/blog/${post.slug}`}
                      className="inline-flex items-center text-orange-500 hover:text-orange-400 font-medium"
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
          <div className="bg-gradient-to-r from-orange-500 to-purple-600 rounded-2xl p-8 lg:p-12 text-center text-white">
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
                className="flex-1 px-4 py-3 rounded-xl text-black placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-orange-600"
              />
              <button className="px-6 py-3 bg-white text-orange-600 rounded-xl font-medium hover:bg-gray-100 transition-colors duration-200">
                Subscribe
              </button>
            </div>
            
            <p className="text-sm opacity-75 mt-4">
              No spam, unsubscribe at any time. Read our privacy policy.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-12 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0">
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg"></div>
              <span className="font-bold">recoder</span>
            </div>
            
            <div className="flex items-center space-x-8 text-sm text-gray-500">
              <Link href="/docs" className="hover:text-white transition-colors">Docs</Link>
              <Link href="/pricing" className="hover:text-white transition-colors">Pricing</Link>
              <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              <Link href="mailto:support@recoder.xyz" className="hover:text-white transition-colors">Support</Link>
            </div>
            
            <div className="text-sm text-gray-500">
              © 2024–2026 Recoder.xyz
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}