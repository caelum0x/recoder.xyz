'use client';

import Link from 'next/link';
import { 
  MapPin, Clock, Users, Heart, Zap, Globe, 
  ArrowRight, CheckCircle, Star, Building, Coffee
} from 'lucide-react';

export default function CareersPage() {
  const openPositions = [
    {
      id: 1,
      title: "Senior Full-Stack Engineer",
      department: "Engineering",
      location: "Remote / San Francisco",
      type: "Full-time",
      experience: "5+ years",
      salary: "$160K - $220K",
      tags: ["React", "Node.js", "TypeScript", "AI/ML"],
      urgent: true
    },
    {
      id: 2,
      title: "AI/ML Engineer",
      department: "AI Research",
      location: "Remote / New York",
      type: "Full-time",
      experience: "3+ years",
      salary: "$180K - $250K",
      tags: ["Python", "TensorFlow", "LLMs", "NLP"],
      urgent: true
    },
    {
      id: 3,
      title: "Product Designer",
      department: "Design",
      location: "Remote / London",
      type: "Full-time",
      experience: "4+ years",
      salary: "$120K - $160K",
      tags: ["Figma", "UI/UX", "Design Systems", "User Research"],
      urgent: false
    },
    {
      id: 4,
      title: "DevOps Engineer",
      department: "Infrastructure",
      location: "Remote",
      type: "Full-time",
      experience: "4+ years",
      salary: "$140K - $190K",
      tags: ["AWS", "Kubernetes", "Docker", "Terraform"],
      urgent: false
    },
    {
      id: 5,
      title: "Technical Writer",
      department: "Developer Relations",
      location: "Remote",
      type: "Full-time",
      experience: "3+ years",
      salary: "$90K - $130K",
      tags: ["Documentation", "API", "Technical Content", "Developer Experience"],
      urgent: false
    },
    {
      id: 6,
      title: "Sales Engineer",
      department: "Sales",
      location: "Remote / Austin",
      type: "Full-time",
      experience: "3+ years",
      salary: "$120K - $180K + Commission",
      tags: ["Enterprise Sales", "Technical Demos", "Customer Success"],
      urgent: false
    }
  ];

  const benefits = [
    {
      icon: Heart,
      title: "Health & Wellness",
      description: "Comprehensive health, dental, and vision insurance. Mental health support and wellness stipend.",
      color: "from-red-500 to-pink-500"
    },
    {
      icon: Globe,
      title: "Remote-First Culture",
      description: "Work from anywhere with flexible hours. We provide home office setup and co-working stipends.",
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: Zap,
      title: "Learning & Growth",
      description: "$3K annual learning budget for courses, conferences, and certifications. Internal mentorship programs.",
      color: "from-yellow-500 to-orange-500"
    },
    {
      icon: Users,
      title: "Equity & Impact",
      description: "Competitive equity package and the opportunity to shape the future of AI-powered development.",
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: Coffee,
      title: "Work-Life Balance",
      description: "Unlimited PTO, parental leave, and quarterly company retreats to amazing destinations.",
      color: "from-purple-500 to-indigo-500"
    },
    {
      icon: Building,
      title: "Office Perks",
      description: "Beautiful offices in major cities with free meals, snacks, and all the coffee you can drink.",
      color: "from-indigo-500 to-purple-500"
    }
  ];

  const teamMembers = [
    {
      name: "Sarah Chen",
      role: "Head of Engineering",
      bio: "Former Principal Engineer at Google. Led teams building ML infrastructure at scale.",
      image: "/api/placeholder/150/150",
      linkedin: "#"
    },
    {
      name: "Marcus Rodriguez",
      role: "VP of Product",
      bio: "Ex-GitHub Product Lead. Passionate about developer tools and user experience.",
      image: "/api/placeholder/150/150",
      linkedin: "#"
    },
    {
      name: "Emily Foster",
      role: "Lead AI Researcher",
      bio: "PhD in Computer Science from Stanford. Published researcher in natural language processing.",
      image: "/api/placeholder/150/150",
      linkedin: "#"
    },
    {
      name: "Alex Thompson",
      role: "Head of Design",
      bio: "Former Design Lead at Figma. Expert in design systems and user-centered design.",
      image: "/api/placeholder/150/150",
      linkedin: "#"
    }
  ];

  const companyValues = [
    {
      title: "Innovation First",
      description: "We're pushing the boundaries of what's possible with AI and development tools."
    },
    {
      title: "User-Centric",
      description: "Every decision starts with our users. We build tools that developers actually want to use."
    },
    {
      title: "Transparency",
      description: "Open communication, honest feedback, and transparent decision-making across all levels."
    },
    {
      title: "Continuous Learning",
      description: "The tech landscape evolves rapidly. We invest in our team's growth and adaptability."
    }
  ];

  const getDepartmentColor = (department: string) => {
    const colors: { [key: string]: string } = {
      "Engineering": "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300",
      "AI Research": "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300",
      "Design": "bg-pink-100 text-pink-800 dark:bg-pink-900/20 dark:text-pink-300",
      "Infrastructure": "bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-300",
      "Developer Relations": "bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-300",
      "Sales": "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-300"
    };
    return colors[department] || "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Hero Section */}
      <section className="relative py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent mb-6">
            Join Our Mission
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-8">
            Help us revolutionize software development with AI. Join a team of passionate builders 
            creating the future of coding, one intelligent tool at a time.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200 transform hover:scale-105">
              View Open Positions
            </button>
            <button className="px-8 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              Learn About Our Culture
            </button>
          </div>
        </div>
      </section>

      {/* Company Stats */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-blue-600 dark:text-blue-400 mb-2">50+</div>
              <div className="text-gray-600 dark:text-gray-300">Team Members</div>
            </div>
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-purple-600 dark:text-purple-400 mb-2">15+</div>
              <div className="text-gray-600 dark:text-gray-300">Countries</div>
            </div>
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-green-600 dark:text-green-400 mb-2">$50M</div>
              <div className="text-gray-600 dark:text-gray-300">Series A Funding</div>
            </div>
            <div className="text-center">
              <div className="text-3xl lg:text-4xl font-bold text-orange-600 dark:text-orange-400 mb-2">4.9</div>
              <div className="text-gray-600 dark:text-gray-300">Glassdoor Rating</div>
            </div>
          </div>
        </div>
      </section>

      {/* Open Positions */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Open Positions
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Join us in building the next generation of AI-powered development tools
            </p>
          </div>
          
          <div className="space-y-6">
            {openPositions.map((position) => (
              <div 
                key={position.id}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                            {position.title}
                          </h3>
                          {position.urgent && (
                            <span className="px-2 py-1 bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-300 rounded-full text-xs font-medium">
                              Urgent
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-300">
                          <div className="flex items-center">
                            <Building className="w-4 h-4 mr-1" />
                            {position.department}
                          </div>
                          <div className="flex items-center">
                            <MapPin className="w-4 h-4 mr-1" />
                            {position.location}
                          </div>
                          <div className="flex items-center">
                            <Clock className="w-4 h-4 mr-1" />
                            {position.type}
                          </div>
                          <div className="flex items-center">
                            <Users className="w-4 h-4 mr-1" />
                            {position.experience}
                          </div>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${getDepartmentColor(position.department)}`}>
                        {position.department}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mb-4">
                      {position.tags.map((tag, index) => (
                        <span 
                          key={index}
                          className="px-2 py-1 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-md text-sm"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                    
                    <div className="text-lg font-semibold text-green-600 dark:text-green-400">
                      {position.salary}
                    </div>
                  </div>
                  
                  <div className="mt-4 lg:mt-0 lg:ml-6">
                    <Link 
                      href={`/careers/${position.id}`}
                      className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl font-medium hover:from-blue-700 hover:to-purple-700 transition-all duration-200"
                    >
                      Apply Now
                      <ArrowRight className="ml-2 w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="text-center mt-8">
            <p className="text-gray-600 dark:text-gray-300 mb-4">
              Don't see a role that fits? We're always looking for exceptional talent.
            </p>
            <button className="px-6 py-3 border border-gray-300 dark:border-slate-600 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all duration-200">
              Send Us Your Resume
            </button>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Why Join Recoder?
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              We believe in taking care of our team so they can do their best work
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {benefits.map((benefit, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className={`w-12 h-12 bg-gradient-to-r ${benefit.color} rounded-lg flex items-center justify-center mb-4`}>
                  <benefit.icon className="w-6 h-6 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-3">
                  {benefit.title}
                </h3>
                <p className="text-gray-600 dark:text-gray-300">
                  {benefit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Meet Our Leadership
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              Experienced leaders from top tech companies, passionate about AI and developer tools
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {teamMembers.map((member, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 text-center hover:shadow-xl transition-all duration-300"
              >
                <div className="w-24 h-24 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
                  {member.name}
                </h3>
                <p className="text-blue-600 dark:text-blue-400 font-medium mb-3">
                  {member.role}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                  {member.bio}
                </p>
                <Link 
                  href={member.linkedin}
                  className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium text-sm"
                >
                  LinkedIn →
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Company Values */}
      <section className="px-4 sm:px-6 lg:px-8 mb-16">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              Our Values
            </h2>
            <p className="text-xl text-gray-600 dark:text-gray-300">
              The principles that guide everything we do
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {companyValues.map((value, index) => (
              <div 
                key={index}
                className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 hover:shadow-xl transition-all duration-300"
              >
                <div className="flex items-start">
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-purple-600 rounded-lg flex items-center justify-center mr-4 mt-1">
                    <CheckCircle className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                      {value.title}
                    </h3>
                    <p className="text-gray-600 dark:text-gray-300">
                      {value.description}
                    </p>
                  </div>
                </div>
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
              Ready to Shape the Future?
            </h2>
            <p className="text-xl opacity-90 mb-8">
              Join us in building the next generation of AI-powered development tools. 
              Your ideas and expertise can help millions of developers worldwide.
            </p>
            
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <button className="px-8 py-3 bg-white text-blue-600 rounded-xl font-medium hover:bg-gray-50 transition-colors duration-200">
                Browse Open Roles
              </button>
              <button className="px-8 py-3 border border-white/30 rounded-xl font-medium hover:bg-white/10 transition-colors duration-200">
                Submit General Application
              </button>
            </div>
            
            <div className="mt-8 flex items-center justify-center space-x-6 text-sm opacity-75">
              <div className="flex items-center">
                <Star className="w-4 h-4 mr-1" />
                Equal Opportunity Employer
              </div>
              <div className="flex items-center">
                <Globe className="w-4 h-4 mr-1" />
                Remote-First Company
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
