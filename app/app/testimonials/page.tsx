'use client';

import Link from 'next/link';
import { Star, Quote, ArrowRight, Users, Building, Globe, CheckCircle } from 'lucide-react';

export default function TestimonialsPage() {
  const featuredTestimonial = {
    id: 1,
    quote: "Recoder transformed our development process. What used to take weeks of coding now takes hours. Our team can focus on creative problem-solving while AI handles the repetitive coding tasks. It's like having a senior developer on every project.",
    author: "Sarah Chen",
    role: "CTO",
    company: "TechFlow Solutions",
    industry: "FinTech",
    companySize: "150+ employees",
    avatar: "/api/placeholder/80/80",
    companyLogo: "/api/placeholder/120/40",
    results: {
      timeReduction: "75%",
      productivityIncrease: "3x",
      bugReduction: "60%",
      projectsCompleted: "40+ projects"
    },
    featured: true
  };

  const testimonials = [
    {
      id: 2,
      quote: "The AI code generation quality is incredible. It understands context, follows our coding standards, and generates production-ready code. We've shipped features 5x faster since adopting Recoder.",
      author: "Marcus Rodriguez",
      role: "Lead Engineer",
      company: "StartupCo",
      industry: "E-commerce",
      companySize: "50-100 employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 3,
      quote: "Recoder's multi-model approach gives us the best of all AI providers. The intelligent routing ensures we always get optimal results for each type of code generation task.",
      author: "Emily Foster",
      role: "VP of Engineering",
      company: "DataCorp",
      industry: "Analytics",
      companySize: "200+ employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 4,
      quote: "The learning curve was practically zero. Our developers were productive from day one. The VS Code integration feels native, and the CLI tools fit perfectly into our existing workflow.",
      author: "David Kim",
      role: "Engineering Manager",
      company: "CloudTech",
      industry: "Cloud Services",
      companySize: "300+ employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 5,
      quote: "Security was our biggest concern with AI-generated code. Recoder's security scanning and best practices integration gave us confidence to use it in production.",
      author: "Lisa Thompson",
      role: "Security Engineer",
      company: "SecureDev",
      industry: "Cybersecurity",
      companySize: "100-200 employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 6,
      quote: "The cost savings are remarkable. We reduced our development time by 60% while improving code quality. The ROI was evident within the first month of implementation.",
      author: "Alex Chen",
      role: "Technical Director",
      company: "InnovateLab",
      industry: "R&D",
      companySize: "75-150 employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 7,
      quote: "Our junior developers are now as productive as seniors thanks to Recoder's intelligent suggestions and error corrections. It's leveled the playing field for our entire team.",
      author: "Jennifer Walsh",
      role: "Head of Development",
      company: "GrowthHacker",
      industry: "Marketing Tech",
      companySize: "50+ employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 8,
      quote: "The real-time collaboration features transformed how our distributed team works together. We can build complex applications with seamless coordination across time zones.",
      author: "Michael Brown",
      role: "Senior Developer",
      company: "GlobalSoft",
      industry: "Enterprise Software",
      companySize: "500+ employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    },
    {
      id: 9,
      quote: "Debugging and refactoring used to be painful. Now Recoder automatically suggests improvements and catches issues before they become problems. Our code quality has never been better.",
      author: "Rachel Green",
      role: "Full-Stack Developer",
      company: "CodeCraft",
      industry: "Web Development",
      companySize: "25-50 employees",
      rating: 5,
      avatar: "/api/placeholder/60/60",
      companyLogo: "/api/placeholder/100/30"
    }
  ];

  const stats = [
    { label: "Customer Satisfaction", value: "98%", icon: "😊" },
    { label: "Average Time Savings", value: "65%", icon: "⏱️" },
    { label: "Code Quality Improvement", value: "70%", icon: "✨" },
    { label: "Projects Accelerated", value: "10,000+", icon: "🚀" }
  ];

  const industries = [
    { name: "FinTech", count: "25+ companies", growth: "+40%" },
    { name: "E-commerce", count: "30+ companies", growth: "+55%" },
    { name: "SaaS", count: "40+ companies", growth: "+60%" },
    { name: "Healthcare", count: "15+ companies", growth: "+35%" },
    { name: "EdTech", count: "20+ companies", growth: "+45%" },
    { name: "Gaming", count: "12+ companies", growth: "+50%" }
  ];

  const companyLogos = [
    "TechFlow", "StartupCo", "DataCorp", "CloudTech", "SecureDev", 
    "InnovateLab", "GrowthHacker", "GlobalSoft", "CodeCraft", "DevStudio",
    "BuildFast", "ScaleUp", "NextGen", "FlowTech", "CodeMax", "DevPro"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Customer Success Stories
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Discover how development teams worldwide are accelerating their productivity and 
            building better software with Recoder's AI-powered development platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              Start Your Success Story
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              Schedule Demo
            </button>
          </div>
        </div>
      </section>

      {/* Success Stats */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl mb-2">{stat.icon}</div>
                <div className="text-3xl lg:text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-600 dark:text-gray-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Testimonial */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-white relative overflow-hidden">
            <div className="absolute top-8 right-8 opacity-20">
              <Quote className="w-24 h-24" />
            </div>
            
            <div className="relative z-10">
              <div className="mb-8">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-white/20 text-white mb-6">
                  <Star className="w-4 h-4 mr-1" />
                  Featured Success Story
                </span>
                
                <blockquote className="text-xl lg:text-2xl font-medium leading-relaxed mb-8">
                  "{featuredTestimonial.quote}"
                </blockquote>
              </div>
              
              <div className="grid lg:grid-cols-2 gap-8">
                <div className="flex items-center">
                  <div className="w-16 h-16 bg-white/20 rounded-full mr-4" />
                  <div>
                    <div className="font-bold text-lg">{featuredTestimonial.author}</div>
                    <div className="opacity-90">{featuredTestimonial.role}</div>
                    <div className="opacity-75">{featuredTestimonial.company}</div>
                    <div className="opacity-75 text-sm">{featuredTestimonial.industry} • {featuredTestimonial.companySize}</div>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{featuredTestimonial.results.timeReduction}</div>
                    <div className="text-sm opacity-75">Time Reduction</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{featuredTestimonial.results.productivityIncrease}</div>
                    <div className="text-sm opacity-75">Productivity Increase</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{featuredTestimonial.results.bugReduction}</div>
                    <div className="text-sm opacity-75">Bug Reduction</div>
                  </div>
                  <div className="bg-white/10 rounded-lg p-4 text-center">
                    <div className="text-2xl font-bold">{featuredTestimonial.results.projectsCompleted}</div>
                    <div className="text-sm opacity-75">Projects Completed</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials Grid */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              What Our Customers Say
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Real feedback from real developers building amazing products
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {testimonials.map((testimonial) => (
              <div 
                key={testimonial.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="mb-4">
                  <div className="flex items-center mb-3">
                    {[...Array(testimonial.rating)].map((_, i) => (
                      <Star key={i} className="w-4 h-4 text-yellow-400 fill-current" />
                    ))}
                  </div>
                  
                  <blockquote className="text-gray-700 dark:text-gray-300 italic mb-4">
                    "{testimonial.quote}"
                  </blockquote>
                </div>
                
                <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
                  <div className="flex items-center">
                    <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mr-3" />
                    <div>
                      <div className="font-bold text-gray-900 dark:text-white">
                        {testimonial.author}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {testimonial.role}
                      </div>
                      <div className="text-sm text-blue-600 dark:text-blue-400">
                        {testimonial.company}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {testimonial.industry} • {testimonial.companySize}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company Logos */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Trusted by Industry Leaders
            </h2>
            <p className="text-gray-600 dark:text-gray-300">
              Join thousands of companies building better software with Recoder
            </p>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-8 items-center">
            {companyLogos.map((company, index) => (
              <div 
                key={index}
                className="h-16 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-gray-600 dark:text-gray-300 font-medium"
              >
                {company}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industry Breakdown */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Success Across Industries
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              From startups to enterprises, teams across every industry trust Recoder
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {industries.map((industry, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                    {industry.name}
                  </h3>
                  <span className="px-2 py-1 bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300 rounded-full text-xs font-medium">
                    {industry.growth}
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-300">
                  {industry.count}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-center text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Ready to Join Our Success Stories?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Start your journey to faster, better software development. 
              Join thousands of developers who've transformed their workflow with Recoder.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                Start Free Trial
              </button>
              <button className="px-8 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors duration-200">
                Schedule Demo
              </button>
            </div>
            
            <div className="mt-8 flex items-center justify-center space-x-6 text-sm opacity-75">
              <div className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                No Credit Card Required
              </div>
              <div className="flex items-center">
                <Users className="w-4 h-4 mr-1" />
                Join 50,000+ Developers
              </div>
              <div className="flex items-center">
                <Globe className="w-4 h-4 mr-1" />
                Global Support
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
