import type { Metadata } from 'next';
import React from 'react';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BookOpen,
  ArrowRight,
  Code,
  Terminal,
  Globe,
  Zap,
  FileText,
  MessageSquare,
  ExternalLink,
  CheckCircle2
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Learn - Recoder.xyz',
  description: 'Get started with Recoder. Documentation, guides, and resources to help you build with AI-powered development tools.',
  openGraph: {
    title: 'Learn - Recoder.xyz',
    description: 'Get started with Recoder. Documentation, guides, and resources for AI-powered development.',
    url: 'https://recoder.xyz/learn',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder Learning Resources' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Learn - Recoder.xyz',
    description: 'Get started with Recoder. Documentation, guides, and resources for AI-powered development.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/learn',
  },
};

export default function LearnPage() {
  const tutorials = [
    {
      title: 'Tutorial 1: Account + Authentication Setup',
      duration: '5-10 min',
      steps: [
        'Create an account at recoder.xyz and verify your email.',
        'Sign in and confirm session access works across app surfaces.',
        'Open Product Management and Agent IDE from the app switcher to validate cross-app access.',
      ],
      links: [
        { label: 'Sign Up', href: '/auth/signup' },
        { label: 'Sign In', href: '/auth/signin' },
        { label: 'PM Workspace', href: 'https://pm.recoder.xyz/app' },
      ],
    },
    {
      title: 'Tutorial 2: Bring Your Own Keys (BYOK)',
      duration: '10-15 min',
      steps: [
        'Go to AI Provider Settings and add at least one provider key.',
        'Verify the key in settings and confirm it appears in your provider list.',
        'Use the same account in another Recoder surface to confirm shared account context.',
      ],
      links: [
        { label: 'AI Provider Settings', href: '/settings/ai-providers' },
        { label: 'Agent IDE', href: 'https://agents.recoder.xyz' },
      ],
    },
    {
      title: 'Tutorial 3: Build Across the Platform',
      duration: '15-20 min',
      steps: [
        'Prototype an agent workflow in the Agent IDE.',
        'Open Workflow Builder to model the orchestration path.',
        'Track roadmap or feedback in Product Management to complete the loop.',
      ],
      links: [
        { label: 'Agent IDE', href: 'https://agents.recoder.xyz' },
        { label: 'Workflow Builder', href: 'https://agency.recoder.xyz' },
        { label: 'Product Management', href: 'https://pm.recoder.xyz' },
      ],
    },
  ];

  const guides = [
    {
      title: 'Getting Started',
      description: 'Set up your account, add your API keys, and build your first project with Recoder.',
      icon: Zap,
      level: 'Beginner',
      href: '/auth/signup'
    },
    {
      title: 'AI Agent IDE',
      description: 'Use the agent IDE to build, test, and deploy AI-powered applications.',
      icon: Terminal,
      level: 'Beginner',
      href: 'https://agents.recoder.xyz'
    },
    {
      title: 'Workflow Builder',
      description: 'Design visual AI workflows — connect nodes, configure models, and run automations.',
      icon: Globe,
      level: 'Intermediate',
      href: 'https://agency.recoder.xyz'
    },
    {
      title: 'Web IDE',
      description: 'Full-featured browser IDE with AI assistance, container-based execution, and live preview.',
      icon: Code,
      level: 'Intermediate',
      href: 'https://web.recoder.xyz'
    }
  ];

  const resources = [
    {
      title: 'Product Management',
      description: 'AI-powered feedback, roadmaps, and releases',
      icon: BookOpen,
      href: 'https://pm.recoder.xyz'
    },
    {
      title: 'About Recoder',
      description: 'Our mission, values, and platform overview',
      icon: FileText,
      href: '/about'
    },
    {
      title: 'Settings & API Keys',
      description: 'Manage your AI provider keys and account',
      icon: MessageSquare,
      href: '/settings/ai-providers'
    }
  ];

  const docsIndex = [
    {
      title: 'Platform Overview',
      description: 'Architecture, mission, and product direction.',
      href: '/about',
    },
    {
      title: 'Learning Hub',
      description: 'Guides, tutorials, and practical onboarding paths.',
      href: '/learn',
    },
    {
      title: 'Authentication Entrypoint',
      description: 'Central sign-in/signup flow used across subdomains.',
      href: '/auth/signin',
    },
    {
      title: 'AI Provider Management',
      description: 'BYOK setup and provider key management.',
      href: '/settings/ai-providers',
    },
  ];

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'Beginner':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'Intermediate':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'Advanced':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader fixed={false} />

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="mb-8">
            <Badge variant="secondary" className="mb-4">
              <BookOpen className="w-4 h-4 mr-2" />
              Resources
            </Badge>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white via-orange-400 to-white bg-clip-text text-transparent">
            Learn Recoder
          </h1>
          <p className="text-xl text-zinc-400 mb-12 max-w-3xl mx-auto">
            Everything you need to get started with AI-powered development.
            Browse our documentation, guides, and resources.
          </p>
        </div>
      </section>

      {/* Guides */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Guides</h2>
            <p className="text-xl text-zinc-400">
              Start building with Recoder
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {guides.map((guide, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
                      <guide.icon className="w-6 h-6 text-white" />
                    </div>
                    <Badge className={getLevelColor(guide.level)}>
                      {guide.level}
                    </Badge>
                  </div>
                  <CardTitle className="text-xl mb-2">{guide.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-zinc-400 mb-6">{guide.description}</p>
                  <Button className="w-full" asChild>
                    <Link href={guide.href}>
                      {guide.href.startsWith('http') ? (
                        <>
                          Open <ExternalLink className="w-4 h-4 ml-2" />
                        </>
                      ) : (
                        <>
                          Read Guide <ArrowRight className="w-4 h-4 ml-2" />
                        </>
                      )}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Tutorials */}
      <section className="py-16 px-4 bg-zinc-900/30">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Tutorial Paths</h2>
            <p className="text-xl text-zinc-400">
              Follow these hands-on paths to get productive quickly.
            </p>
          </div>

          <div className="grid gap-6">
            {tutorials.map((tutorial, index) => (
              <Card key={index} className="border-zinc-800 bg-zinc-900/60">
                <CardHeader>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <CardTitle className="text-xl">{tutorial.title}</CardTitle>
                    <Badge variant="outline" className="w-fit border-zinc-700 text-zinc-300">
                      {tutorial.duration}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    {tutorial.steps.map((step, stepIndex) => (
                      <div key={stepIndex} className="flex items-start gap-2 text-zinc-300">
                        <CheckCircle2 className="h-4 w-4 mt-0.5 text-orange-400 shrink-0" />
                        <span>{step}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {tutorial.links.map((link, linkIndex) => (
                      <Button key={linkIndex} variant="outline" size="sm" asChild>
                        <Link href={link.href}>
                          {link.label}
                          <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Resources */}
      <section className="py-16 px-4 bg-zinc-900/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Resources</h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {resources.map((resource, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <resource.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-lg mb-2">{resource.title}</h3>
                  <p className="text-sm text-zinc-400 mb-4">{resource.description}</p>
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

      {/* Documentation Index */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Documentation Index</h2>
            <p className="text-xl text-zinc-400">
              Core docs entrypoints currently available on the platform.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-6">
            {docsIndex.map((doc, index) => (
              <Card key={index} className="border-zinc-800 bg-zinc-900/40">
                <CardContent className="p-6">
                  <h3 className="text-lg font-semibold mb-2">{doc.title}</h3>
                  <p className="text-zinc-400 mb-4">{doc.description}</p>
                  <Button variant="ghost" className="p-0 h-auto text-orange-400 hover:text-orange-300" asChild>
                    <Link href={doc.href}>
                      Open
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
          <Card className="border-0 shadow-xl bg-gradient-to-r from-orange-500 to-purple-600 text-white">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Ready to Start Building?</h2>
              <p className="text-lg opacity-90 mb-8">
                Sign up for free during beta. Bring your own API keys and start building.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/auth/signup">
                    Get Started Free
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-orange-600" asChild>
                  <Link href="/about">
                    About Recoder
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
