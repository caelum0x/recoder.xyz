import React from 'react';
import Link from 'next/link';
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

export default function SecurityCenterPage() {
  const securityFeatures = [
    {
      icon: Shield,
      title: 'Enterprise-Grade Security',
      description: 'SOC 2 Type II compliant infrastructure with 99.99% uptime guarantee',
      features: ['ISO 27001 Certified', 'SOC 2 Type II', 'GDPR Compliant', '24/7 Monitoring']
    },
    {
      icon: Lock,
      title: 'End-to-End Encryption',
      description: 'All data encrypted in transit and at rest using AES-256 encryption',
      features: ['TLS 1.3 Encryption', 'AES-256 at Rest', 'Zero-Knowledge Architecture', 'Key Rotation']
    },
    {
      icon: Key,
      title: 'Identity & Access Management',
      description: 'Robust authentication and authorization with enterprise SSO support',
      features: ['Multi-Factor Auth', 'SSO Integration', 'Role-Based Access', 'Session Management']
    },
    {
      icon: Database,
      title: 'Data Protection',
      description: 'Advanced data governance with automated backups and disaster recovery',
      features: ['Automated Backups', 'Point-in-Time Recovery', 'Data Residency', 'Retention Policies']
    },
    {
      icon: Eye,
      title: 'Privacy Controls',
      description: 'Comprehensive privacy controls with user data ownership guarantees',
      features: ['Data Portability', 'Right to Delete', 'Privacy Dashboard', 'Consent Management']
    },
    {
      icon: Server,
      title: 'Infrastructure Security',
      description: 'Military-grade infrastructure security with advanced threat protection',
      features: ['DDoS Protection', 'WAF Security', 'Intrusion Detection', 'Vulnerability Scanning']
    }
  ];

  const certifications = [
    {
      name: 'SOC 2 Type II',
      description: 'System and Organization Controls audit for security, availability, and confidentiality',
      status: 'certified',
      icon: Award,
      validUntil: '2024-12-31'
    },
    {
      name: 'ISO 27001',
      description: 'International standard for information security management systems',
      status: 'certified',
      icon: Shield,
      validUntil: '2025-06-30'
    },
    {
      name: 'GDPR Compliance',
      description: 'Full compliance with General Data Protection Regulation',
      status: 'compliant',
      icon: Globe,
      validUntil: 'Ongoing'
    },
    {
      name: 'HIPAA Ready',
      description: 'Healthcare industry compliance for sensitive data handling',
      status: 'ready',
      icon: FileCheck,
      validUntil: 'On Request'
    }
  ];

  const securityPolicies = [
    {
      title: 'Security Policy',
      description: 'Comprehensive security framework and procedures',
      lastUpdated: '2024-01-15',
      href: '/security/policy'
    },
    {
      title: 'Privacy Policy',
      description: 'How we collect, use, and protect your personal information',
      lastUpdated: '2024-01-10',
      href: '/privacy'
    },
    {
      title: 'Terms of Service',
      description: 'Legal terms and conditions for using Recoder services',
      lastUpdated: '2024-01-05',
      href: '/terms'
    },
    {
      title: 'Data Processing Agreement',
      description: 'GDPR-compliant data processing terms for enterprise customers',
      lastUpdated: '2024-01-20',
      href: '/security/dpa'
    },
    {
      title: 'Incident Response Plan',
      description: 'Our procedures for handling security incidents',
      lastUpdated: '2023-12-15',
      href: '/security/incident-response'
    },
    {
      title: 'Penetration Testing Reports',
      description: 'Regular third-party security assessments and findings',
      lastUpdated: '2024-01-01',
      href: '/security/pen-testing'
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
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <Shield className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                Recoder Security Center
              </span>
            </Link>
            <Button asChild>
              <Link href="/contact">Contact Security Team</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <div className="mb-8">
            <Badge variant="secondary" className="mb-4">
              <Shield className="w-4 h-4 mr-2" />
              Enterprise Security
            </Badge>
          </div>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-blue-800 to-slate-900 dark:from-white dark:via-blue-400 dark:to-white bg-clip-text text-transparent">
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
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
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
          <Card className="border-0 shadow-xl bg-gradient-to-r from-blue-600 to-purple-600 text-white">
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
    </div>
  );
}
