'use client';

import Link from 'next/link';
import { 
  ArrowRight, TrendingUp, Clock, Users, Code, CheckCircle, 
  Star, Building, Target, Zap, DollarSign, BarChart3
} from 'lucide-react';

export default function CaseStudiesPage() {
  const featuredCaseStudy = {
    id: 1,
    title: "TechFlow Solutions: From 6 Months to 6 Weeks",
    subtitle: "How a FinTech startup accelerated their MVP development by 75% using Recoder",
    company: "TechFlow Solutions",
    industry: "FinTech",
    companySize: "50-100 employees",
    challenge: "Building a complex financial dashboard with real-time analytics in a tight timeframe",
    solution: "Used Recoder's AI-powered development platform for full-stack application generation",
    image: "/api/placeholder/800/400",
    logo: "/api/placeholder/150/50",
    metrics: {
      timeReduction: "75%",
      costSavings: "$150K",
      productivityIncrease: "3x",
      bugReduction: "60%"
    },
    tags: ["React", "Node.js", "Financial Dashboard", "Real-time Analytics"],
    featured: true
  };

  const caseStudies = [
    {
      id: 2,
      title: "E-commerce Giant Scales Development",
      company: "ShopFlow",
      industry: "E-commerce",
      companySize: "500+ employees",
      challenge: "Scaling microservices architecture for Black Friday traffic",
      timeframe: "3 months",
      results: {
        metric1: { label: "API Response Time", value: "50% faster" },
        metric2: { label: "Development Speed", value: "4x increase" },
        metric3: { label: "Code Quality Score", value: "95%" }
      },
      image: "/api/placeholder/400/250",
      tags: ["Microservices", "Kubernetes", "High Traffic", "API Development"]
    },
    {
      id: 3,
      title: "Healthcare Platform Modernization",
      company: "MedTech Pro",
      industry: "Healthcare",
      companySize: "200-500 employees",
      challenge: "Modernizing legacy HIPAA-compliant patient management system",
      timeframe: "6 months",
      results: {
        metric1: { label: "Security Score", value: "99.8%" },
        metric2: { label: "Performance", value: "80% faster" },
        metric3: { label: "Compliance", value: "100% HIPAA" }
      },
      image: "/api/placeholder/400/250",
      tags: ["Healthcare", "HIPAA", "Legacy Migration", "Security"]
    },
    {
      id: 4,
      title: "EdTech Startup Rapid Prototyping",
      company: "LearnFast",
      industry: "Education",
      companySize: "10-50 employees",
      challenge: "Building interactive learning platform with AI tutoring",
      timeframe: "2 months",
      results: {
        metric1: { label: "Time to Market", value: "70% faster" },
        metric2: { label: "Student Engagement", value: "+150%" },
        metric3: { label: "Development Cost", value: "60% savings" }
      },
      image: "/api/placeholder/400/250",
      tags: ["Education", "AI Tutoring", "Interactive Platform", "Startup"]
    },
    {
      id: 5,
      title: "Gaming Studio Mobile Game Launch",
      company: "PixelCraft Games",
      industry: "Gaming",
      companySize: "100-200 employees",
      challenge: "Cross-platform mobile game with real-time multiplayer",
      timeframe: "4 months",
      results: {
        metric1: { label: "Cross-Platform", value: "iOS + Android" },
        metric2: { label: "Concurrent Players", value: "10K+" },
        metric3: { label: "Launch Speed", value: "2x faster" }
      },
      image: "/api/placeholder/400/250",
      tags: ["Gaming", "Mobile", "Real-time", "Cross-platform"]
    },
    {
      id: 6,
      title: "Enterprise HR Platform Overhaul",
      company: "HRTech Solutions",
      industry: "HR Technology",
      companySize: "300+ employees",
      challenge: "Building comprehensive HR management system with AI insights",
      timeframe: "8 months",
      results: {
        metric1: { label: "Employee Satisfaction", value: "+40%" },
        metric2: { label: "HR Efficiency", value: "3x improvement" },
        metric3: { label: "Data Insights", value: "Real-time AI" }
      },
      image: "/api/placeholder/400/250",
      tags: ["HR Tech", "Enterprise", "AI Insights", "Management System"]
    }
  ];

  const successMetrics = [
    {
      label: "Average Development Speed Increase",
      value: "250%",
      description: "Teams complete projects 2.5x faster on average",
      icon: Zap,
      color: "from-yellow-500 to-orange-500"
    },
    {
      label: "Cost Reduction",
      value: "65%",
      description: "Average development cost savings across all projects",
      icon: DollarSign,
      color: "from-green-500 to-emerald-500"
    },
    {
      label: "Code Quality Improvement",
      value: "80%",
      description: "Fewer bugs, better performance, cleaner architecture",
      icon: Code,
      color: "from-blue-500 to-cyan-500"
    },
    {
      label: "Time to Market Reduction",
      value: "70%",
      description: "Launch products and features significantly faster",
      icon: Clock,
      color: "from-purple-500 to-indigo-500"
    }
  ];

  const industries = [
    { name: "FinTech", studies: 8, highlight: "Payment Processing, Trading Platforms" },
    { name: "E-commerce", studies: 12, highlight: "Marketplaces, Shopping Platforms" },
    { name: "Healthcare", studies: 6, highlight: "Patient Management, Telemedicine" },
    { name: "Education", studies: 5, highlight: "Learning Platforms, LMS" },
    { name: "Gaming", studies: 4, highlight: "Mobile Games, Multiplayer" },
    { name: "Enterprise SaaS", studies: 15, highlight: "CRM, ERP, Analytics" }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Case Studies
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Deep dive into real customer implementations and discover how Recoder transforms 
            development workflows across industries. See the measurable impact on speed, quality, and cost.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              Download Full Report
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              Schedule Consultation
            </button>
          </div>
        </div>
      </section>

      {/* Success Metrics */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Proven Results Across All Studies
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Consistent improvements across development speed, quality, and cost efficiency
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {successMetrics.map((metric, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 text-center"
              >
                <div className={`w-16 h-16 bg-gradient-to-r ${metric.color} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <metric.icon className="w-8 h-8 text-white" />
                </div>
                <div className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                  {metric.value}
                </div>
                <div className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-2">
                  {metric.label}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {metric.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Case Study */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl overflow-hidden">
            <div className="absolute top-6 left-6 z-10">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-600 text-white">
                <Star className="w-3 h-3 mr-1" />
                Featured Study
              </span>
            </div>
            
            <div className="lg:flex">
              <div className="lg:w-1/2">
                <div className="h-64 lg:h-full bg-gradient-to-br from-blue-500 to-purple-600 relative">
                  <div className="absolute inset-0 bg-black/20" />
                  <div className="absolute bottom-6 left-6 text-white">
                    <div className="flex flex-wrap gap-2">
                      {featuredCaseStudy.tags.map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-white/20 rounded-md text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="lg:w-1/2 p-8 lg:p-12">
                <div className="flex items-center mb-4">
                  <div className="w-12 h-12 bg-gray-200 dark:bg-slate-700 rounded mr-3" />
                  <div>
                    <div className="font-semibold text-gray-900 dark:text-white">
                      {featuredCaseStudy.company}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      {featuredCaseStudy.industry} • {featuredCaseStudy.companySize}
                    </div>
                  </div>
                </div>
                
                <h2 className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-4">
                  {featuredCaseStudy.title}
                </h2>
                <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                  {featuredCaseStudy.subtitle}
                </p>
                
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                      {featuredCaseStudy.metrics.timeReduction}
                    </div>
                    <div className="text-sm text-green-700 dark:text-green-300">Time Reduction</div>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                      {featuredCaseStudy.metrics.costSavings}
                    </div>
                    <div className="text-sm text-blue-700 dark:text-blue-300">Cost Savings</div>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                      {featuredCaseStudy.metrics.productivityIncrease}
                    </div>
                    <div className="text-sm text-purple-700 dark:text-purple-300">Productivity</div>
                  </div>
                  <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {featuredCaseStudy.metrics.bugReduction}
                    </div>
                    <div className="text-sm text-orange-700 dark:text-orange-300">Bug Reduction</div>
                  </div>
                </div>
                
                <Link 
                  href={`/case-studies/${featuredCaseStudy.id}`}
                  className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
                >
                  Read Full Case Study
                  <ArrowRight className="ml-2 w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Case Studies Grid */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              More Success Stories
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Explore detailed case studies across different industries and use cases
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {caseStudies.map((study) => (
              <div 
                key={study.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="h-48 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-slate-700 dark:to-slate-600 relative">
                  <div className="absolute top-4 right-4">
                    <span className="px-2 py-1 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 rounded-md text-xs font-medium">
                      {study.timeframe}
                    </span>
                  </div>
                  <div className="absolute bottom-4 left-4">
                    <div className="flex flex-wrap gap-1">
                      {study.tags.slice(0, 2).map((tag, index) => (
                        <span key={index} className="px-2 py-1 bg-black/20 text-white rounded text-xs">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                
                <div className="p-6">
                  <div className="flex items-center mb-3">
                    <Building className="w-4 h-4 text-gray-500 dark:text-gray-400 mr-2" />
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      {study.company} • {study.industry} • {study.companySize}
                    </span>
                  </div>
                  
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                    {study.title}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300 mb-4">
                    {study.challenge}
                  </p>
                  
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div className="text-center">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {study.results.metric1.value}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {study.results.metric1.label}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        {study.results.metric2.value}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {study.results.metric2.label}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        {study.results.metric3.value}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">
                        {study.results.metric3.label}
                      </div>
                    </div>
                  </div>
                  
                  <Link 
                    href={`/case-studies/${study.id}`}
                    className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                  >
                    Read Case Study
                    <ArrowRight className="ml-1 w-4 h-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Success Across Industries
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              See how different industries leverage Recoder for their unique challenges
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {industries.map((industry, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {industry.name}
                  </h3>
                  <span className="px-3 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 rounded-full text-sm font-medium">
                    {industry.studies} studies
                  </span>
                </div>
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {industry.highlight}
                </p>
                <Link 
                  href={`/case-studies/industry/${industry.name.toLowerCase()}`}
                  className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  View {industry.name} Studies
                  <ArrowRight className="ml-1 w-4 h-4" />
                </Link>
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
              Ready to Create Your Success Story?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Join the companies already transforming their development process. 
              Let's discuss how Recoder can accelerate your next project.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                Start Your Case Study
              </button>
              <button className="px-8 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors duration-200">
                Download Case Study Report
              </button>
            </div>
            
            <div className="mt-8 flex items-center justify-center space-x-6 text-sm opacity-75">
              <div className="flex items-center">
                <Target className="w-4 h-4 mr-1" />
                Proven Results
              </div>
              <div className="flex items-center">
                <BarChart3 className="w-4 h-4 mr-1" />
                Measurable ROI
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Industry Validated
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
