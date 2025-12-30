'use client';

import Link from 'next/link';
import { 
  ArrowRight, CheckCircle, Star, Building, Globe, Zap, 
  Target, Users, Award, DollarSign, TrendingUp, Shield,
  ExternalLink, Mail, Calendar, FileText
} from 'lucide-react';

export default function PartnershipsPage() {
  const partnerTiers = [
    {
      name: "Integration Partner",
      description: "Build and list integrations in our marketplace",
      benefits: [
        "API access and documentation",
        "Technical support and training",
        "Marketing co-opportunities",
        "Revenue sharing on premium integrations",
        "Partner badge and directory listing"
      ],
      requirements: [
        "Active product with API",
        "Developer resources",
        "Technical documentation"
      ],
      color: "from-blue-500 to-blue-600",
      icon: Zap
    },
    {
      name: "Solution Partner",
      description: "Resell and implement Recoder for enterprise clients",
      benefits: [
        "Up to 30% commission on sales",
        "Dedicated partner manager",
        "Sales and technical training",
        "Marketing development funds",
        "Priority technical support"
      ],
      requirements: [
        "Proven enterprise sales track record",
        "Technical implementation capability",
        "Customer success resources"
      ],
      color: "from-green-500 to-green-600",
      icon: Target
    },
    {
      name: "Technology Partner",
      description: "Strategic technology partnerships and joint solutions",
      benefits: [
        "Joint go-to-market strategy",
        "Co-marketing opportunities",
        "Product integration roadmap",
        "Executive relationship management",
        "Industry event collaboration"
      ],
      requirements: [
        "Complementary technology offering",
        "Enterprise customer base",
        "Strategic alignment with our roadmap"
      ],
      color: "from-purple-500 to-purple-600",
      icon: Building
    }
  ];

  const currentPartners = [
    {
      name: "GitHub",
      type: "Integration Partner",
      description: "Seamless repository integration and pull request automation",
      logo: "/api/placeholder/120/40",
      featured: true,
      category: "Developer Tools"
    },
    {
      name: "Vercel",
      type: "Integration Partner", 
      description: "One-click deployment and hosting optimization",
      logo: "/api/placeholder/120/40",
      featured: true,
      category: "Deployment"
    },
    {
      name: "AWS",
      type: "Technology Partner",
      description: "Cloud infrastructure and AI services integration",
      logo: "/api/placeholder/120/40",
      featured: true,
      category: "Cloud"
    },
    {
      name: "Slack",
      type: "Integration Partner",
      description: "Team collaboration and notification workflows",
      logo: "/api/placeholder/120/40",
      featured: false,
      category: "Communication"
    },
    {
      name: "Figma",
      type: "Integration Partner",
      description: "Design-to-code automation and component generation",
      logo: "/api/placeholder/120/40",
      featured: false,
      category: "Design"
    },
    {
      name: "Stripe",
      type: "Integration Partner",
      description: "Payment processing and e-commerce integrations",
      logo: "/api/placeholder/120/40",
      featured: false,
      category: "Payments"
    },
    {
      name: "MongoDB",
      type: "Technology Partner",
      description: "Database integration and schema generation",
      logo: "/api/placeholder/120/40",
      featured: false,
      category: "Database"
    },
    {
      name: "Docker",
      type: "Integration Partner",
      description: "Containerization and deployment automation",
      logo: "/api/placeholder/120/40",
      featured: false,
      category: "DevOps"
    }
  ];

  const partnerPrograms = [
    {
      title: "Startup Partner Program",
      description: "Special benefits for early-stage companies building on Recoder",
      benefits: [
        "Free Pro tier for 12 months",
        "Technical mentorship",
        "Investor introduction opportunities",
        "Priority feature requests"
      ],
      cta: "Apply for Startup Program",
      icon: TrendingUp,
      color: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
    },
    {
      title: "Enterprise Reseller Program",
      description: "Become an authorized reseller for enterprise Recoder solutions",
      benefits: [
        "Competitive commission structure",
        "Dedicated sales support",
        "Marketing co-op funds",
        "Training and certification"
      ],
      cta: "Become a Reseller",
      icon: DollarSign,
      color: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
    },
    {
      title: "Academic Partnership",
      description: "Bring AI-powered development education to students and researchers",
      benefits: [
        "Free access for educational use",
        "Curriculum development support",
        "Research collaboration opportunities",
        "Student certification programs"
      ],
      cta: "Partner with Education",
      icon: Award,
      color: "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
    }
  ];

  const partnerResources = [
    {
      title: "Partner Portal",
      description: "Access marketing materials, training, and support resources",
      icon: Shield,
      link: "/partners/portal"
    },
    {
      title: "API Documentation",
      description: "Complete technical documentation for integrations",
      icon: FileText,
      link: "/docs/api"
    },
    {
      title: "Partner Training",
      description: "Comprehensive training programs and certifications",
      icon: Users,
      link: "/partners/training"
    },
    {
      title: "Marketing Resources",
      description: "Co-marketing materials and brand guidelines",
      icon: Globe,
      link: "/partners/marketing"
    }
  ];

  const partnerStats = [
    { label: "Active Partners", value: "150+" },
    { label: "Integrations Available", value: "80+" },
    { label: "Partner-Driven Revenue", value: "40%" },
    { label: "Average Partner ROI", value: "300%" }
  ];

  const partnerSuccess = [
    {
      quote: "Our integration with Recoder has driven 40% of our new enterprise customers. The partnership team made integration seamless.",
      author: "Sarah Chen",
      company: "DevTools Pro",
      role: "VP of Partnerships",
      result: "40% customer growth"
    },
    {
      quote: "As a solution partner, we've seen incredible demand for Recoder implementations. Our clients love the productivity gains.",
      author: "Marcus Rodriguez", 
      company: "Enterprise Solutions Inc",
      role: "Principal Consultant",
      result: "$2M revenue generated"
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Partnership Ecosystem
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Join our growing ecosystem of partners building the future of AI-powered development. 
            From integrations to reseller programs, we offer multiple ways to grow together.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              Become a Partner
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              View Partner Directory
            </button>
          </div>
        </div>
      </section>

      {/* Partner Stats */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {partnerStats.map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-3xl lg:text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">
                  {stat.value}
                </div>
                <div className="text-gray-600 dark:text-gray-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Tiers */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Partnership Programs
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Choose the partnership tier that aligns with your business goals
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {partnerTiers.map((tier, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className={`w-16 h-16 bg-gradient-to-r ${tier.color} rounded-xl flex items-center justify-center mb-6`}>
                  <tier.icon className="w-8 h-8 text-white" />
                </div>
                
                <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                  {tier.name}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {tier.description}
                </p>
                
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Benefits:</h4>
                  <div className="space-y-2">
                    {tier.benefits.map((benefit, idx) => (
                      <div key={idx} className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                        {benefit}
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mb-6">
                  <h4 className="font-semibold text-gray-900 dark:text-white mb-3">Requirements:</h4>
                  <div className="space-y-2">
                    {tier.requirements.map((req, idx) => (
                      <div key={idx} className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                        <Star className="w-4 h-4 text-yellow-500 mr-2 flex-shrink-0 mt-0.5" />
                        {req}
                      </div>
                    ))}
                  </div>
                </div>
                
                <button className="w-full px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200">
                  Apply for {tier.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Current Partners */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Our Partner Ecosystem
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Leading companies trust Recoder for their development integrations
            </p>
          </div>
          
          {/* Featured Partners */}
          <div className="mb-12">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">
              Featured Partners
            </h3>
            <div className="grid md:grid-cols-3 gap-8">
              {currentPartners.filter(p => p.featured).map((partner, index) => (
                <div 
                  key={index}
                  className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 text-center"
                >
                  <div className="h-16 bg-gray-100 dark:bg-slate-700 rounded-lg flex items-center justify-center mb-4">
                    <span className="text-gray-600 dark:text-gray-300 font-bold">
                      {partner.name}
                    </span>
                  </div>
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300 mb-3">
                    {partner.type}
                  </span>
                  <h4 className="font-bold text-gray-900 dark:text-white mb-2">
                    {partner.name}
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                    {partner.description}
                  </p>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {partner.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
          
          {/* All Partners Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-6">
            {currentPartners.map((partner, index) => (
              <div 
                key={index}
                className="h-16 bg-white dark:bg-slate-800 rounded-lg shadow flex items-center justify-center hover:shadow-md transition-shadow duration-200"
              >
                <span className="text-gray-600 dark:text-gray-300 font-medium text-sm">
                  {partner.name}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Special Programs */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Special Programs
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Tailored partnership opportunities for specific sectors and use cases
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {partnerPrograms.map((program, index) => (
              <div 
                key={index}
                className={`border-2 rounded-xl p-6 hover:shadow-lg transition-all duration-300 ${program.color}`}
              >
                <div className="flex items-center mb-4">
                  <program.icon className="w-8 h-8 text-blue-600 dark:text-blue-400 mr-3" />
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                    {program.title}
                  </h3>
                </div>
                
                <p className="text-gray-600 dark:text-gray-300 mb-6">
                  {program.description}
                </p>
                
                <div className="space-y-2 mb-6">
                  {program.benefits.map((benefit, idx) => (
                    <div key={idx} className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                      {benefit}
                    </div>
                  ))}
                </div>
                
                <button className="w-full px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors duration-200">
                  {program.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Success Stories */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Partner Success Stories
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              See how our partners are growing their business with Recoder
            </p>
          </div>
          
          <div className="grid lg:grid-cols-2 gap-8">
            {partnerSuccess.map((story, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 hover:shadow-xl transition-all duration-300"
              >
                <div className="mb-6">
                  <div className="text-4xl text-blue-600 dark:text-blue-400 mb-4">"</div>
                  <blockquote className="text-lg text-gray-700 dark:text-gray-300 italic mb-4">
                    {story.quote}
                  </blockquote>
                </div>
                
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 dark:text-white">
                      {story.author}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-300">
                      {story.role}, {story.company}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600 dark:text-green-400">
                      {story.result}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Partner Resources */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Partner Resources
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Everything you need to succeed as a Recoder partner
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {partnerResources.map((resource, index) => (
              <Link 
                key={index}
                href={resource.link}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 text-center"
              >
                <resource.icon className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">
                  {resource.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-3">
                  {resource.description}
                </p>
                <div className="inline-flex items-center text-blue-600 dark:text-blue-400 font-medium">
                  Access Resource
                  <ExternalLink className="ml-1 w-4 h-4" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="px-4 sm:px-6 lg:px-8 pb-20">
        <div className="max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 lg:p-12 text-center text-white">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">
              Ready to Partner with Recoder?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Join our ecosystem of innovative partners and grow your business with 
              the leading AI-powered development platform.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                Apply for Partnership
              </button>
              <button className="px-8 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors duration-200">
                Schedule Partnership Call
              </button>
            </div>
            
            <div className="mt-8 flex items-center justify-center space-x-6 text-sm opacity-75">
              <div className="flex items-center">
                <Mail className="w-4 h-4 mr-1" />
                partners@recoder.xyz
              </div>
              <div className="flex items-center">
                <Calendar className="w-4 h-4 mr-1" />
                Quick Response Time
              </div>
              <div className="flex items-center">
                <CheckCircle className="w-4 h-4 mr-1" />
                Trusted by 150+ Partners
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
