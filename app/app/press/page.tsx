'use client';

import Link from 'next/link';
import { 
  Download, ExternalLink, Copy, Image, FileText, Users, 
  Calendar, Award, Newspaper, ChevronDown, CheckCircle
} from 'lucide-react';

export default function PressKitPage() {
  const pressReleases = [
    {
      id: 1,
      title: "Recoder Raises $50M Series A to Revolutionize AI-Powered Development",
      date: "December 15, 2024",
      category: "Funding",
      excerpt: "Leading AI development platform secures major funding round led by Sequoia Capital to accelerate product development and global expansion.",
      downloadUrl: "/press/recoder-series-a-announcement.pdf"
    },
    {
      id: 2,
      title: "Recoder Launches Multi-Model AI Architecture for Enhanced Code Generation",
      date: "November 28, 2024",
      category: "Product",
      excerpt: "Revolutionary approach combines 15+ AI models to deliver unprecedented accuracy and speed in automated code generation.",
      downloadUrl: "/press/recoder-multi-model-launch.pdf"
    },
    {
      id: 3,
      title: "Fortune 500 Companies Choose Recoder for Enterprise Development",
      date: "November 10, 2024",
      category: "Enterprise",
      excerpt: "Major enterprises report 65% reduction in development time and $2M+ annual savings using Recoder's AI platform.",
      downloadUrl: "/press/recoder-enterprise-adoption.pdf"
    },
    {
      id: 4,
      title: "Recoder Named 'AI Startup of the Year' by TechCrunch",
      date: "October 22, 2024",
      category: "Awards",
      excerpt: "Recognition highlights Recoder's innovative approach to democratizing software development through artificial intelligence.",
      downloadUrl: "/press/recoder-techcrunch-award.pdf"
    }
  ];

  const brandAssets = [
    {
      category: "Logos",
      description: "Official Recoder logos in various formats and orientations",
      items: [
        { name: "Primary Logo (SVG)", size: "Vector", format: "SVG" },
        { name: "Primary Logo (PNG)", size: "1024x1024", format: "PNG" },
        { name: "Horizontal Logo", size: "2048x512", format: "PNG" },
        { name: "Icon Only", size: "512x512", format: "PNG" },
        { name: "White Logo", size: "1024x1024", format: "PNG" },
        { name: "Black Logo", size: "1024x1024", format: "PNG" }
      ]
    },
    {
      category: "Brand Colors",
      description: "Official color palette and brand guidelines",
      items: [
        { name: "Color Palette (Figma)", size: "-", format: "Figma" },
        { name: "Brand Guidelines", size: "-", format: "PDF" },
        { name: "Color Swatches", size: "-", format: "ASE" }
      ]
    },
    {
      category: "Product Screenshots",
      description: "High-quality screenshots of our platform interfaces",
      items: [
        { name: "Dashboard Overview", size: "2560x1440", format: "PNG" },
        { name: "Code Generation Demo", size: "2560x1440", format: "PNG" },
        { name: "Chat Interface", size: "1920x1080", format: "PNG" },
        { name: "Mobile App", size: "1125x2436", format: "PNG" },
        { name: "VS Code Extension", size: "1920x1080", format: "PNG" },
        { name: "CLI Interface", size: "1920x1080", format: "PNG" }
      ]
    },
    {
      category: "Team Photos",
      description: "Professional photos of Recoder team and leadership",
      items: [
        { name: "CEO Headshot", size: "2048x2048", format: "JPG" },
        { name: "Leadership Team", size: "3000x2000", format: "JPG" },
        { name: "Office Photos", size: "Various", format: "JPG" },
        { name: "Team Working", size: "3000x2000", format: "JPG" }
      ]
    }
  ];

  const mediaKit = [
    {
      title: "Company Fact Sheet",
      description: "Key company information, statistics, and milestones",
      format: "PDF",
      size: "2 pages",
      downloadUrl: "/press/recoder-fact-sheet.pdf"
    },
    {
      title: "Executive Bios",
      description: "Detailed biographies of leadership team members",
      format: "DOCX",
      size: "5 pages",
      downloadUrl: "/press/recoder-executive-bios.docx"
    },
    {
      title: "Product Demo Video",
      description: "3-minute product demonstration video",
      format: "MP4",
      size: "1080p",
      downloadUrl: "/press/recoder-demo-video.mp4"
    },
    {
      title: "Customer Success Stories",
      description: "Detailed case studies and testimonials",
      format: "PDF",
      size: "12 pages",
      downloadUrl: "/press/recoder-case-studies.pdf"
    }
  ];

  const companyStats = [
    { label: "Founded", value: "2023" },
    { label: "Employees", value: "50+" },
    { label: "Headquarters", value: "San Francisco, CA" },
    { label: "Funding Raised", value: "$55M" },
    { label: "Active Users", value: "100K+" },
    { label: "Lines of Code Generated", value: "10M+" },
    { label: "Countries", value: "50+" },
    { label: "Enterprise Customers", value: "200+" }
  ];

  const awards = [
    {
      title: "AI Startup of the Year",
      organization: "TechCrunch",
      year: "2024",
      description: "Recognized for innovative AI-powered development platform"
    },
    {
      title: "Best Developer Tool",
      organization: "Product Hunt",
      year: "2024",
      description: "Top-rated developer productivity tool"
    },
    {
      title: "Rising Star in AI",
      organization: "Forbes",
      year: "2024",
      description: "Featured in Forbes 30 Under 30 Enterprise Technology"
    },
    {
      title: "Innovation Award",
      organization: "DevTech Summit",
      year: "2024",
      description: "Outstanding innovation in software development tools"
    }
  ];

  const mediaContacts = [
    {
      name: "Sarah Martinez",
      title: "VP of Communications",
      email: "press@recoder.xyz",
      phone: "+1 (555) 123-4567",
      speciality: "General inquiries, partnerships"
    },
    {
      name: "David Chen",
      title: "Product Communications",
      email: "product-pr@recoder.xyz",
      phone: "+1 (555) 234-5678",
      speciality: "Product announcements, technical features"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Press Kit
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Media resources, brand assets, and company information for journalists, 
            partners, and content creators covering Recoder's AI-powered development platform.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              Download Full Press Kit
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              Contact Media Team
            </button>
          </div>
        </div>
      </section>

      {/* Company Overview */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 lg:p-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-6 text-center">
              Company Overview
            </h2>
            
            <div className="grid lg:grid-cols-2 gap-12">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">About Recoder</h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                  Recoder is revolutionizing software development with AI-powered tools that enable developers 
                  to build applications faster, better, and more efficiently. Our platform combines multiple 
                  AI models to provide intelligent code generation, real-time collaboration, and seamless 
                  deployment capabilities.
                </p>
                <p className="text-gray-600 dark:text-gray-300 mb-6 leading-relaxed">
                  Founded in 2023, Recoder has quickly become the go-to platform for developers worldwide, 
                  serving over 100,000 active users and generating millions of lines of code. Our mission 
                  is to democratize software development and empower every developer to build amazing applications.
                </p>
                
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Key Statistics</h3>
                <div className="grid grid-cols-2 gap-4">
                  {companyStats.map((stat, index) => (
                    <div key={index} className="text-center p-3 bg-gray-50 dark:bg-slate-700 rounded-lg">
                      <div className="text-lg font-bold text-blue-600 dark:text-blue-400">
                        {stat.value}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Awards & Recognition</h3>
                <div className="space-y-4">
                  {awards.map((award, index) => (
                    <div key={index} className="border-l-4 border-blue-500 pl-4">
                      <div className="flex items-center mb-1">
                        <Award className="w-4 h-4 text-yellow-500 mr-2" />
                        <span className="font-bold text-gray-900 dark:text-white">
                          {award.title}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                          ({award.year})
                        </span>
                      </div>
                      <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">
                        {award.organization}
                      </div>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        {award.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Press Releases */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Latest Press Releases
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Recent company announcements and news
            </p>
          </div>
          
          <div className="space-y-6">
            {pressReleases.map((release) => (
              <div 
                key={release.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 rounded-md text-xs font-medium">
                        {release.category}
                      </span>
                      <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                        <Calendar className="w-4 h-4 mr-1" />
                        {release.date}
                      </div>
                    </div>
                    
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                      {release.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300 mb-4">
                      {release.excerpt}
                    </p>
                  </div>
                  
                  <div className="lg:ml-6">
                    <Link 
                      href={release.downloadUrl}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download PDF
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Brand Assets */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Brand Assets
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Official logos, colors, and visual assets for media use
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {brandAssets.map((category, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden"
              >
                <div className="p-6 border-b border-gray-200 dark:border-slate-700">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                    {category.category}
                  </h3>
                  <p className="text-gray-600 dark:text-gray-300">
                    {category.description}
                  </p>
                </div>
                
                <div className="p-6">
                  <div className="space-y-3">
                    {category.items.map((item, idx) => (
                      <div key={idx} className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">
                            {item.name}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {item.size} • {item.format}
                          </div>
                        </div>
                        <button className="p-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors duration-200">
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  
                  <button className="w-full mt-4 px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors duration-200">
                    Download All {category.category}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Media Kit */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Media Kit Resources
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Essential materials for journalists and content creators
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {mediaKit.map((item, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center">
                    <FileText className="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                        {item.title}
                      </h3>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {item.format} • {item.size}
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-gray-600 dark:text-gray-300 mb-4">
                  {item.description}
                </p>
                
                <Link 
                  href={item.downloadUrl}
                  className="inline-flex items-center text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Download
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Media Contacts */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4 text-center">
              Media Contacts
            </h2>
            <p className="text-xl opacity-90 mb-8 text-center">
              Get in touch with our media team for interviews, quotes, and additional information
            </p>
            
            <div className="grid md:grid-cols-2 gap-8">
              {mediaContacts.map((contact, index) => (
                <div key={index} className="bg-white/10 rounded-xl p-6">
                  <div className="flex items-center mb-4">
                    <Users className="w-8 h-8 mr-3" />
                    <div>
                      <div className="font-bold text-lg">{contact.name}</div>
                      <div className="opacity-90">{contact.title}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-2 text-sm opacity-90">
                    <div>📧 {contact.email}</div>
                    <div>📞 {contact.phone}</div>
                    <div>🎯 {contact.speciality}</div>
                  </div>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-8">
              <p className="text-sm opacity-75">
                For general inquiries: press@recoder.xyz • For urgent matters: +1 (555) 123-4567
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
