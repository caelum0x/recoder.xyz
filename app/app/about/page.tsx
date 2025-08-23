import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Target, 
  Users, 
  Globe, 
  Zap,
  Shield,
  Heart,
  ArrowRight,
  Github,
  Twitter,
  MessageSquare,
  Award,
  TrendingUp,
  Code2
} from 'lucide-react';

export default function AboutPage() {
  const stats = [
    { label: 'Active Developers', value: '10K+', icon: Users },
    { label: 'Code Generated', value: '50M+ Lines', icon: Code2 },
    { label: 'AI Models', value: '15+', icon: Zap },
    { label: 'Countries', value: '80+', icon: Globe }
  ];

  const values = [
    {
      icon: Target,
      title: 'Production-First',
      description: 'We generate real, working code that ships to production, not mockups or prototypes.'
    },
    {
      icon: Shield,
      title: 'Security & Privacy',
      description: 'Your code and data remain private. We offer local AI options and never store your sensitive information.'
    },
    {
      icon: Zap,
      title: 'Speed & Efficiency',
      description: 'AI-powered development that accelerates your workflow without sacrificing code quality.'
    },
    {
      icon: Heart,
      title: 'Developer-Centric',
      description: 'Built by developers, for developers. Every feature is designed to enhance your coding experience.'
    }
  ];

  const team = [
    {
      name: 'Alex Thompson',
      role: 'Founder & CEO',
      image: '/team/alex.jpg',
      bio: 'Former OpenAI engineer with 10+ years in AI/ML development.',
      social: { github: 'alexthompson', twitter: 'alexthompsonai' }
    },
    {
      name: 'Sarah Chen',
      role: 'CTO & Co-founder',
      image: '/team/sarah.jpg',
      bio: 'Ex-Google senior engineer, expert in distributed systems and AI infrastructure.',
      social: { github: 'sarahchen', twitter: 'sarahchentech' }
    },
    {
      name: 'Marcus Rodriguez',
      role: 'Head of Product',
      image: '/team/marcus.jpg',
      bio: 'Product leader from Microsoft, specializes in developer tools and UX.',
      social: { github: 'marcusrodriguez', twitter: 'marcusproduct' }
    }
  ];

  const timeline = [
    {
      date: '2024 Q1',
      title: 'Company Founded',
      description: 'Started with a vision to revolutionize AI-powered development'
    },
    {
      date: '2024 Q2',
      title: 'Alpha Release',
      description: 'Launched CLI with basic AI code generation capabilities'
    },
    {
      date: '2024 Q3',
      title: 'Multi-AI Platform',
      description: 'Integrated Claude, Groq, Gemini, and OpenAI for diverse AI capabilities'
    },
    {
      date: '2024 Q4',
      title: 'Web & Chat Platforms',
      description: 'Released web-based IDE and intelligent chat interface'
    },
    {
      date: '2025 Q1',
      title: 'Enterprise Features',
      description: 'Team collaboration, advanced analytics, and enterprise security'
    },
    {
      date: '2025 Q2',
      title: 'Global Expansion',
      description: 'Multi-language support and international data centers'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Heart className="w-4 h-4" />
            About Recoder.xyz
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Building the Future of <br />
            <span className="bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              AI-Powered Development
            </span>
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            We're on a mission to democratize software development through intelligent AI tools that 
            generate production-ready code, not just prototypes.
          </p>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-4xl mx-auto mb-12">
            {stats.map((stat, index) => {
              const Icon = stat.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-3">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100">
                    {stat.value}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {stat.label}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Mission & Values */}
      <section className="py-20 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Mission & Values</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              We believe in empowering developers with AI tools that enhance creativity and productivity, 
              not replace human ingenuity.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {values.map((value, index) => {
              const Icon = value.icon;
              return (
                <Card key={index} className="group hover:shadow-lg transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-xl">{value.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600 dark:text-slate-300">{value.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Journey</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              From a simple idea to a comprehensive AI development platform
            </p>
          </div>

          <div className="max-w-4xl mx-auto">
            <div className="grid md:grid-cols-2 gap-8">
              {timeline.map((item, index) => (
                <Card key={index} className="relative">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <Badge variant="secondary">{item.date}</Badge>
                      {index < 4 && <Award className="w-4 h-4 text-yellow-500" />}
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-slate-600 dark:text-slate-300">{item.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Meet the Team</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-2xl mx-auto">
              Passionate engineers and product leaders building the next generation of development tools
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {team.map((member, index) => (
              <Card key={index} className="text-center group hover:shadow-lg transition-all duration-300">
                <CardHeader>
                  <div className="w-24 h-24 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mx-auto mb-4 flex items-center justify-center">
                    <Users className="w-12 h-12 text-white" />
                  </div>
                  <CardTitle>{member.name}</CardTitle>
                  <CardDescription>{member.role}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{member.bio}</p>
                  <div className="flex justify-center gap-3">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`https://github.com/${member.social.github}`} target="_blank">
                        <Github className="w-4 h-4" />
                      </Link>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`https://twitter.com/${member.social.twitter}`} target="_blank">
                        <Twitter className="w-4 h-4" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Transform Your Development?</h2>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            Join thousands of developers who are building faster and smarter with AI-powered tools.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" asChild>
              <Link href="/auth/signin" className="flex items-center gap-2">
                <span>Get Started Free</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/docs" className="flex items-center gap-2">
                <span>Read Documentation</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}