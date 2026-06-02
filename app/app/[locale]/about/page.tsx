import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Target,
  Shield,
  Zap,
  Heart,
  ArrowRight,
  Code2,
  Globe,
  Layers,
  Compass,
  Users,
  Rocket
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'About Recoder - External Agent Work Platform | Recoder.xyz',
  description: 'Recoder.xyz is building the control plane for external coding agents to execute real software work with preview, task state, and handoff.',
  openGraph: {
    title: 'About Recoder - External Agent Work Platform | Recoder.xyz',
    description: 'Recoder.xyz is building the control plane for external coding agents to execute real software work.',
    url: 'https://recoder.xyz/about',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'About Recoder - External Agent Work Platform',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'About Recoder - External Agent Work Platform',
    description: 'Recoder.xyz is building the control plane for external coding agents to execute real software work.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/about',
  },
};

export default function AboutPage() {
  const story = [
    {
      icon: Compass,
      title: 'Why We Started',
      description:
        'Modern teams use powerful external coding agents, but the surrounding workflow is fragmented. Recoder exists to make execution, preview, task state, and handoff feel like one connected system.',
    },
    {
      icon: Users,
      title: 'How We Build',
      description:
        'We ship in public, use our own products daily, and prioritize practical reliability over hype-driven demos.',
    },
    {
      icon: Rocket,
      title: 'What We Optimize For',
      description:
        'Faster execution loops, clearer ownership, and production-ready outputs that teams can actually trust.',
    },
  ];

  const values = [
    {
      icon: Target,
      title: 'Production-First',
      description: 'We care about real software execution, not demo-only AI outputs.'
    },
    {
      icon: Shield,
      title: 'Security & Privacy',
      description: 'Your code and data remain private. BYOK (Bring Your Own Key) means your provider relationship stays with you.'
    },
    {
      icon: Zap,
      title: 'BYOK Control',
      description: 'Use the best model for each task without turning Recoder into a token reseller.'
    },
    {
      icon: Heart,
      title: 'Developer-Centric',
      description: 'Built by developers, for developers. Every feature is designed to improve agent execution and human control.'
    }
  ];

  const platform = [
    {
      icon: Code2,
      title: 'External Agents',
      description: 'Connect coding agents and route work through a shared execution surface.',
      href: 'https://agents.recoder.xyz'
    },
    {
      icon: Layers,
      title: 'Delivery Packaging',
      description: 'Wrap approved outputs for downstream delivery workflows when the core loop is already proven.',
      href: 'https://agency.recoder.xyz'
    },
    {
      icon: Globe,
      title: 'Task State & Approvals',
      description: 'Manage assignment, artifacts, and approvals around real software execution.',
      href: 'https://pm.recoder.xyz'
    }
  ];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <SiteHeader />
      {/* Hero Section */}
      <section className="pt-20 pb-16 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-orange-900/30 text-orange-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Heart className="w-4 h-4" />
            About Recoder.xyz
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            AI-Powered Development <br />
            <span className="bg-gradient-to-r from-orange-500 to-purple-600 bg-clip-text text-transparent">
              Platform
            </span>
          </h1>
          <p className="text-xl text-zinc-400 mb-8 max-w-3xl mx-auto">
            Recoder is a unified platform for AI-powered development. Build applications, design workflows,
            and manage products — all with your own AI keys, on your own terms.
          </p>
          <p className="text-sm text-zinc-500 mb-12">
            Currently in beta — free to use with your own API keys.
          </p>
        </div>
      </section>

      {/* Product Story */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Product Story</h2>
            <p className="text-xl text-zinc-400 max-w-3xl mx-auto">
              Recoder started as an internal effort to remove handoff friction between engineering and product.
              The result became a multi-surface platform where agent execution, workflow orchestration, and product planning
              stay aligned from idea to release.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {story.map((item, index) => {
              const Icon = item.icon;
              return (
                <Card key={index} className="group hover:shadow-lg transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-xl">{item.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-zinc-400">{item.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Mission & Values */}
      <section className="py-20 px-4 bg-zinc-900/50">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Our Values</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
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
                      <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Icon className="w-6 h-6 text-white" />
                      </div>
                      <CardTitle className="text-xl">{value.title}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-zinc-400">{value.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-20 px-4 bg-zinc-900/30">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">Team & Operating Model</h2>
            <p className="text-xl text-zinc-400">
              We are a product-engineering team focused on platform reliability, practical AI tooling, and clear user outcomes.
            </p>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-4 text-zinc-300">
              <p>
                We keep scope tight and ship improvements in small, verifiable increments. Every major change is measured against three questions:
                does it reduce complexity, improve execution speed, and hold up in production.
              </p>
              <p>
                Recoder is currently in beta, so we prioritize runtime health, auth consistency, and workflow quality before broad feature expansion.
                This lets teams adopt the platform confidently while we continue to iterate quickly.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Platform */}
      <section className="py-20 px-4">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">The Platform</h2>
            <p className="text-xl text-zinc-400 max-w-2xl mx-auto">
              Recoder is a suite of tools for the modern development workflow
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {platform.map((item, index) => {
              const Icon = item.icon;
              return (
                <Card key={index} className="text-center group hover:shadow-lg transition-all duration-300">
                  <CardHeader>
                    <div className="w-16 h-16 bg-gradient-to-r from-orange-500 to-purple-600 rounded-xl mx-auto mb-4 flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Icon className="w-8 h-8 text-white" />
                    </div>
                    <CardTitle>{item.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-zinc-400 mb-4">{item.description}</p>
                    <Link
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-orange-400 hover:text-orange-300 font-medium inline-flex items-center gap-1"
                    >
                      Visit <ArrowRight className="w-3 h-3" />
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-bold mb-6">Ready to Get Started?</h2>
          <p className="text-xl text-zinc-400 mb-8 max-w-2xl mx-auto">
            Try Recoder free during beta — bring your own API keys, no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/auth/signup" className="px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 text-white rounded-md font-medium hover:from-orange-600 hover:to-purple-700 flex items-center gap-2">
              <span>Get Started Free</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link href="/learn" className="px-6 py-3 border border-zinc-700 text-zinc-300 rounded-md font-medium hover:bg-zinc-800 flex items-center gap-2">
              <span>Learn More</span>
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
