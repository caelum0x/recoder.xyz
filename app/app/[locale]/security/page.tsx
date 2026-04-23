import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Shield,
  Lock,
  Key,
  FileCheck,
  AlertTriangle,
  CheckCircle,
  Users,
  Globe,
  Database,
  Eye,
  Zap,
  ArrowRight,
  Download,
  ExternalLink,
  Award,
  Server,
  Cloud
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Security & Trust | Recoder.xyz',
  description: 'Understand how Recoder handles BYOK credentials, encrypted storage, secure transport, and trust-oriented product design for AI workflows.',
  openGraph: {
    title: 'Security & Trust | Recoder.xyz',
    description: 'BYOK, encrypted key storage, secure transport, and practical security posture for AI-powered development.',
    url: 'https://recoder.xyz/security',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Recoder Security & Compliance Center',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Security & Trust | Recoder.xyz',
    description: 'BYOK, encrypted key storage, secure transport, and practical security posture for AI workflows.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/security',
  },
};

export default function SecurityCenterPage() {
  const securityFeatures = [
    {
      icon: Key,
      title: 'BYOK Data Boundary',
      description: 'Recoder is designed so teams can bring their own provider credentials and maintain direct vendor billing relationships.',
      features: ['Provider choice stays with you', 'No bundled AI lock-in', 'Cost visibility stays upstream', 'Works with multi-provider setups']
    },
    {
      icon: Lock,
      title: 'Encrypted Key Storage',
      description: 'Stored credentials are encrypted at rest and moved only over HTTPS/TLS-secured transport.',
      features: ['Encrypted at rest', 'HTTPS/TLS in transit', 'No plaintext key display in normal flows', 'Secret rotation supported operationally']
    },
    {
      icon: Shield,
      title: 'Sandboxed Execution',
      description: 'Code execution paths use isolated runtime boundaries so generated work does not run directly on the public marketing surface.',
      features: ['Isolated runtimes', 'Scoped execution surfaces', 'Operational cleanup tooling', 'Preview-link controls']
    },
    {
      icon: Database,
      title: 'Account and Access Controls',
      description: 'OAuth-first account flows, session controls, and service-specific routing reduce unnecessary credential exposure.',
      features: ['GitHub/Google sign-in', 'Scoped redirects', 'Sign-out flows', 'Auth error handling']
    },
    {
      icon: Eye,
      title: 'Audit-Friendly Operations',
      description: 'Operational logs, health surfaces, and email pipeline diagnostics are exposed so failures are observable instead of silent.',
      features: ['Health checks', 'Structured logs', 'Email ops visibility', 'Queue status inspection']
    },
    {
      icon: Server,
      title: 'Practical Security Roadmap',
      description: 'Recoder emphasizes transparent current posture instead of overstated compliance claims.',
      features: ['Trust pages kept current', 'Known limitations documented', 'Operational rollout guidance', 'Security improvements shipped incrementally']
    }
  ];

  const certifications = [
    {
      name: 'OAuth-first Account Access',
      description: 'Primary public auth flows use GitHub and Google instead of a sprawling password surface.',
      status: 'active',
      icon: Shield,
      validUntil: 'Current'
    },
    {
      name: 'Encrypted Credential Storage',
      description: 'API keys are stored as encrypted secrets rather than raw provider credentials.',
      status: 'active',
      icon: Lock,
      validUntil: 'Current'
    },
    {
      name: 'Secure Transport',
      description: 'Public site and application surfaces are expected to operate over HTTPS.',
      status: 'active',
      icon: Globe,
      validUntil: 'Current'
    },
    {
      name: 'Compliance Roadmap',
      description: 'Formal certification and enterprise attestations should be treated as roadmap work unless explicitly published.',
      status: 'planned',
      icon: FileCheck,
      validUntil: 'Roadmap'
    }
  ];

  const securityPolicies = [
    {
      title: 'Privacy Policy',
      description: 'How Recoder handles account data, provider keys, and product usage information.',
      lastUpdated: '2026-04-23',
      href: '/privacy'
    },
    {
      title: 'Terms of Service',
      description: 'Current legal terms for using Recoder and BYOK-powered workflows.',
      lastUpdated: '2026-04-23',
      href: '/terms'
    },
    {
      title: 'Getting Started',
      description: 'Operational setup path for new users connecting providers and starting work.',
      lastUpdated: '2026-04-23',
      href: '/docs/getting-started'
    },
    {
      title: 'Contact and Security Reporting',
      description: 'Reach the team for support questions or responsible disclosure.',
      lastUpdated: '2026-04-23',
      href: '/contact'
    }
  ];

  const securityBestPractices = [
    {
      title: 'API Key Management',
      description: 'Best practices for securing your API keys and access tokens',
      icon: Key,
      tips: [
        'Never commit API keys to version control',
        'Use environment variables for key storage',
        'Rotate keys regularly (every 90 days)',
        'Use different keys for dev/staging/production'
      ]
    },
    {
      title: 'Code Security',
      description: 'Guidelines for secure coding practices with AI assistance',
      icon: Lock,
      tips: [
        'Review AI-generated code before deployment',
        'Use static analysis tools for vulnerability scanning',
        'Implement proper input validation',
        'Follow OWASP security guidelines'
      ]
    },
    {
      title: 'Team Security',
      description: 'Securing team collaboration and access management',
      icon: Users,
      tips: [
        'Enable two-factor authentication for all team members',
        'Use role-based access control (RBAC)',
        'Regularly audit team permissions',
        'Implement session timeout policies'
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <SiteHeader fixed={false} />

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="mb-8">
            <Badge variant="secondary" className="mb-4">
              <Shield className="w-4 h-4 mr-2" />
              Enterprise Security
            </Badge>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-orange-600 to-slate-900 dark:from-white dark:via-orange-400 dark:to-white bg-clip-text text-transparent">
            Security & Compliance
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            Enterprise-grade security, privacy, and compliance for AI-powered development. 
            Your code and data are protected by industry-leading security measures.
          </p>
          
          {/* Trust Indicators */}
          <div className="flex flex-wrap justify-center gap-6 mb-12">
            <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium">SOC 2 Type II</span>
            </div>
            <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium">ISO 27001</span>
            </div>
            <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium">GDPR Compliant</span>
            </div>
            <div className="flex items-center space-x-2 bg-white dark:bg-slate-800 px-4 py-2 rounded-full shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium">99.99% Uptime</span>
            </div>
          </div>
        </div>
      </section>

      {/* Security Features */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Security Features</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300 max-w-3xl mx-auto">
              Comprehensive security measures designed to protect your most valuable assets
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {securityFeatures.map((feature, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader>
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-xl">{feature.title}</CardTitle>
                  <CardDescription className="text-base">{feature.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {feature.features.map((item, idx) => (
                      <li key={idx} className="flex items-center text-sm text-slate-600 dark:text-slate-300">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Certifications */}
      <section className="py-16 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Certifications & Compliance</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Independently verified security and compliance standards
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {certifications.map((cert, index) => (
              <Card key={index} className="text-center border-0 shadow-lg">
                <CardHeader className="pb-4">
                  <div className="w-16 h-16 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <cert.icon className="w-8 h-8 text-white" />
                  </div>
                  <CardTitle className="text-lg">{cert.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mb-4">{cert.description}</p>
                  <div className="flex items-center justify-center space-x-2">
                    <Badge variant={cert.status === 'certified' ? 'default' : 'secondary'}>
                      {cert.status}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">Valid until: {cert.validUntil}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Policies */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Security Documentation</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Transparent policies and procedures for your security review
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {securityPolicies.map((policy, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center justify-between">
                    {policy.title}
                    <ExternalLink className="w-4 h-4 text-slate-400" />
                  </CardTitle>
                  <CardDescription>{policy.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Updated: {policy.lastUpdated}</span>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={policy.href}>
                        View
                        <ArrowRight className="w-4 h-4 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Security Best Practices */}
      <section className="py-16 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Security Best Practices</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Guidelines to help you use Recoder securely and effectively
            </p>
          </div>
          
          <div className="grid lg:grid-cols-3 gap-8">
            {securityBestPractices.map((practice, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <div className="w-10 h-10 bg-gradient-to-r from-purple-500 to-pink-500 rounded-lg flex items-center justify-center mb-4">
                    <practice.icon className="w-5 h-5 text-white" />
                  </div>
                  <CardTitle className="text-lg">{practice.title}</CardTitle>
                  <CardDescription>{practice.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-3">
                    {practice.tips.map((tip, idx) => (
                      <li key={idx} className="flex items-start text-sm text-slate-600 dark:text-slate-300">
                        <CheckCircle className="w-4 h-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                        {tip}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Security Team */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl text-center">
          <Card className="border-0 shadow-xl bg-gradient-to-r from-orange-500 to-purple-600 text-white">
            <CardContent className="p-12">
              <h2 className="text-3xl font-bold mb-4">Security Questions?</h2>
              <p className="text-lg opacity-90 mb-8">
                Our security team is here to help with compliance questions, 
                security reviews, and custom security requirements.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button variant="secondary" size="lg" asChild>
                  <Link href="/contact">
                    Contact Security Team
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Link>
                </Button>
                <Button variant="outline" size="lg" className="border-white text-white hover:bg-white hover:text-blue-600" asChild>
                  <Link href="/security/incident-report">
                    Report Security Issue
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
