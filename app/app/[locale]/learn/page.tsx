import type { Metadata } from 'next';
import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  Video,
  Trophy,
  Users,
  Clock,
  Star,
  Play,
  Download,
  ArrowRight,
  CheckCircle,
  Code,
  Terminal,
  Globe,
  MessageSquare,
  Zap,
  Award,
  Target,
  TrendingUp,
  FileText,
  Headphones,
  Monitor
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Learn - Recoder.xyz',
  description: 'Master AI-powered development with courses, certifications, and hands-on workshops. From beginner to expert.',
  openGraph: {
    title: 'Learn - Recoder.xyz',
    description: 'Master AI-powered development with courses, certifications, and hands-on workshops. From beginner to expert.',
    url: 'https://recoder.xyz/learn',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder Learning Center' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Learn - Recoder.xyz',
    description: 'Master AI-powered development with courses, certifications, and hands-on workshops.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/learn',
  },
};

export default function LearningCenterPage() {
  const learningPaths = [
    {
      title: 'Getting Started with Recoder',
      description: 'Complete beginner\'s guide to AI-powered development',
      level: 'Beginner',
      duration: '2 hours',
      lessons: 8,
      students: 15420,
      rating: 4.9,
      topics: ['Installation', 'First Project', 'Basic Commands', 'AI Integration'],
      icon: Zap,
      progress: 0,
      href: '/learn/getting-started'
    },
    {
      title: 'Advanced CLI Mastery',
      description: 'Master the command-line interface for professional development',
      level: 'Advanced',
      duration: '4 hours',
      lessons: 15,
      students: 8932,
      rating: 4.8,
      topics: ['Custom Commands', 'Automation', 'Multi-AI Workflows', 'Team Collaboration'],
      icon: Terminal,
      progress: 0,
      href: '/learn/cli-mastery'
    },
    {
      title: 'Building Production Apps',
      description: 'Create, deploy, and maintain production-ready applications',
      level: 'Intermediate',
      duration: '6 hours',
      lessons: 20,
      students: 12456,
      rating: 4.9,
      topics: ['Architecture', 'Testing', 'Deployment', 'Monitoring'],
      icon: Globe,
      progress: 0,
      href: '/learn/production-apps'
    },
    {
      title: 'AI-Assisted Development',
      description: 'Leverage AI for maximum productivity and code quality',
      level: 'Intermediate',
      duration: '3 hours',
      lessons: 12,
      students: 18203,
      rating: 4.7,
      topics: ['Prompt Engineering', 'Code Review', 'Debugging', 'Optimization'],
      icon: Code,
      progress: 0,
      href: '/learn/ai-development'
    }
  ];

  const featuredCourses = [
    {
      title: 'Zero to Production in 1 Hour',
      description: 'Build and deploy your first AI-generated app from scratch',
      duration: '1 hour',
      type: 'Workshop',
      instructor: 'Sarah Chen',
      rating: 4.9,
      students: 25403,
      price: 'Free',
      thumbnail: '/api/placeholder/400/225',
      tags: ['Beginner', 'Quick Start', 'Hands-on'],
      href: '/learn/zero-to-production'
    },
    {
      title: 'Enterprise Integration Patterns',
      description: 'Integrate Recoder into large-scale enterprise environments',
      duration: '3 hours',
      type: 'Course',
      instructor: 'David Rodriguez',
      rating: 4.8,
      students: 5678,
      price: '$99',
      thumbnail: '/api/placeholder/400/225',
      tags: ['Advanced', 'Enterprise', 'Architecture'],
      href: '/learn/enterprise-integration'
    },
    {
      title: 'Multi-Model AI Strategies',
      description: 'Optimize costs and performance with smart model selection',
      duration: '2.5 hours',
      type: 'Masterclass',
      instructor: 'Dr. Emily Watson',
      rating: 4.9,
      students: 9234,
      price: '$149',
      thumbnail: '/api/placeholder/400/225',
      tags: ['Advanced', 'AI', 'Optimization'],
      href: '/learn/multi-model-ai'
    }
  ];

  const certifications = [
    {
      name: 'Recoder Certified Developer',
      description: 'Demonstrate proficiency in AI-powered development workflows',
      level: 'Associate',
      duration: '2-3 weeks prep',
      price: '$199',
      badge: '🥉',
      skills: ['CLI Usage', 'Basic AI Integration', 'Project Setup', 'Debugging'],
      benefits: ['Digital Certificate', 'LinkedIn Badge', 'Resume Enhancement'],
      href: '/certification/developer'
    },
    {
      name: 'Recoder Professional',
      description: 'Advanced certification for production-ready AI development',
      level: 'Professional',
      duration: '4-6 weeks prep',
      price: '$399',
      badge: '🥈',
      skills: ['Advanced CLI', 'Production Deployment', 'Team Collaboration', 'Performance Optimization'],
      benefits: ['Digital Certificate', 'Priority Support', 'Beta Access', 'Community Recognition'],
      href: '/certification/professional'
    },
    {
      name: 'Recoder Expert',
      description: 'Elite certification for AI development thought leaders',
      level: 'Expert',
      duration: '8-12 weeks prep',
      price: '$799',
      badge: '🥇',
      skills: ['Enterprise Architecture', 'Custom AI Models', 'Team Leadership', 'Innovation'],
      benefits: ['All Previous Benefits', 'Direct Access to Team', 'Speaking Opportunities', 'Early Access'],
      href: '/certification/expert'
    }
  ];

  const resources = [
    {
      title: 'Documentation',
      description: 'Comprehensive guides and API references',
      icon: BookOpen,
      count: '200+ pages',
      href: '/docs',
      type: 'Reference'
    },
    {
      title: 'Video Tutorials',
      description: 'Step-by-step video guides for all skill levels',
      icon: Video,
      count: '50+ videos',
      href: '/learn/videos',
      type: 'Visual'
    },
    {
      title: 'Interactive Workshops',
      description: 'Hands-on coding sessions with live instructors',
      icon: Users,
      count: 'Weekly sessions',
      href: '/learn/workshops',
      type: 'Live'
    },
    {
      title: 'Code Examples',
      description: 'Real-world project templates and samples',
      icon: Code,
      count: '100+ examples',
      href: '/learn/examples',
      type: 'Practical'
    },
    {
      title: 'Podcast Series',
      description: 'Developer stories and AI development insights',
      icon: Headphones,
      count: '25+ episodes',
      href: '/learn/podcast',
      type: 'Audio'
    },
    {
      title: 'Community Forum',
      description: 'Connect with other developers and get help',
      icon: MessageSquare,
      count: '10K+ members',
      href: '/community',
      type: 'Community'
    }
  ];

  const stats = [
    { label: 'Total Students', value: '75,000+', icon: Users },
    { label: 'Courses Completed', value: '250,000+', icon: Trophy },
    { label: 'Avg. Completion Rate', value: '89%', icon: Target },
    { label: 'Student Satisfaction', value: '4.8/5', icon: Star }
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Intermediate':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Advanced':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      case 'Expert':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <SiteHeader fixed={false} />

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="mb-8">
            <Badge variant="secondary" className="mb-4">
              <Trophy className="w-4 h-4 mr-2" />
              Level Up Your Skills
            </Badge>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-blue-800 to-slate-900 dark:from-white dark:via-blue-400 dark:to-white bg-clip-text text-transparent">
            Master AI Development
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-12 max-w-3xl mx-auto">
            From beginner to expert, our comprehensive learning platform helps you master AI-powered development with hands-on courses, certifications, and real-world projects.
          </p>
          
          {/* Stats */}
          <div className="grid md:grid-cols-4 gap-6 mb-12">
            {stats.map((stat, index) => (
              <div key={index} className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
                <div className="flex items-center justify-center mb-2">
                  <stat.icon className="w-6 h-6 text-blue-500" />
                </div>
                <div className="text-2xl font-bold text-blue-600 mb-1">{stat.value}</div>
                <div className="text-sm text-slate-600 dark:text-slate-300">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Learning Paths */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Learning Paths</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Structured curriculum designed to take you from zero to professional
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-8">
            {learningPaths.map((path, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <path.icon className="w-6 h-6 text-white" />
                    </div>
                    <Badge className={getLevelColor(path.level)}>
                      {path.level}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl mb-2">{path.title}</CardTitle>
                  <CardDescription className="text-base">{path.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                      <Clock className="w-4 h-4 mr-2" />
                      {path.duration}
                    </div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                      <BookOpen className="w-4 h-4 mr-2" />
                      {path.lessons} lessons
                    </div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                      <Users className="w-4 h-4 mr-2" />
                      {path.students.toLocaleString()} students
                    </div>
                    <div className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                      <Star className="w-4 h-4 mr-2 text-yellow-500" />
                      {path.rating} rating
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="text-sm font-medium mb-2">Topics Covered:</div>
                    <div className="flex flex-wrap gap-2">
                      {path.topics.map((topic, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {topic}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  
                  <Button className="w-full" asChild>
                    <Link href={path.href}>
                      Start Learning
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Courses */}
      <section className="py-16 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Featured Courses</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Hand-picked courses from our expert instructors
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {featuredCourses.map((course, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden">
                <div className="relative">
                  <div className="w-full h-48 bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center">
                    <Play className="w-12 h-12 text-white" />
                  </div>
                  <div className="absolute top-4 right-4">
                    <Badge variant="secondary">{course.type}</Badge>
                  </div>
                  <div className="absolute bottom-4 left-4">
                    <Badge className="bg-black/50 text-white">{course.duration}</Badge>
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="text-lg">{course.title}</CardTitle>
                  <CardDescription>{course.description}</CardDescription>
                  <div className="flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                    <span>by {course.instructor}</span>
                    <div className="flex items-center">
                      <Star className="w-4 h-4 text-yellow-500 mr-1" />
                      {course.rating}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {course.tags.map((tag, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                      {course.students.toLocaleString()} students
                    </div>
                    <div className="text-lg font-bold text-blue-600">
                      {course.price}
                    </div>
                  </div>
                  
                  <Button className="w-full" asChild>
                    <Link href={course.href}>
                      {course.price === 'Free' ? 'Start Free Course' : 'Enroll Now'}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Professional Certifications</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Validate your skills with industry-recognized certifications
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {certifications.map((cert, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 text-center">
                <CardHeader>
                  <div className="text-4xl mb-4">{cert.badge}</div>
                  <CardTitle className="text-xl">{cert.name}</CardTitle>
                  <Badge className={getLevelColor(cert.level)} variant="secondary">
                    {cert.level}
                  </Badge>
                  <CardDescription className="text-base mt-2">{cert.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Prep Time:</span>
                      <span className="font-medium">{cert.duration}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Price:</span>
                      <span className="font-medium text-blue-600">{cert.price}</span>
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="text-sm font-medium mb-2">Key Skills:</div>
                    <div className="space-y-1">
                      {cert.skills.map((skill, idx) => (
                        <div key={idx} className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                          <CheckCircle className="w-3 h-3 text-green-500 mr-2" />
                          {skill}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <div className="mb-6">
                    <div className="text-sm font-medium mb-2">Benefits:</div>
                    <div className="space-y-1">
                      {cert.benefits.map((benefit, idx) => (
                        <div key={idx} className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                          <Award className="w-3 h-3 text-blue-500 mr-2" />
                          {benefit}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  <Button className="w-full" asChild>
                    <Link href={cert.href}>
                      Start Certification
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-16 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Learning Resources</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Everything you need to succeed in your learning journey
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {resources.map((resource, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <resource.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{resource.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{resource.description}</p>
                  <div className="flex items-center justify-between text-sm mb-4">
                    <Badge variant="outline">{resource.type}</Badge>
                    <span className="text-slate-500">{resource.count}</span>
                  </div>
                  <Button variant="outline" size="sm" className="w-full" asChild>
                    <Link href={resource.href}>
                      Explore
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <Card className="border-0 shadow-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Ready to Start Learning?</h2>
              <p className="text-lg opacity-90 mb-8">
                Start building with AI-powered tools today.
                Our free courses cover everything from setup to advanced workflows.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/learn/getting-started">
                    Start Free Course
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600" asChild>
                  <Link href="/learn/all-courses">
                    Browse All Courses
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
