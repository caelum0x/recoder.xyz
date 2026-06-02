import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail,
  MessageSquare,
  Phone,
  MapPin,
  Clock,
  Send,
  ArrowRight,
  Headphones,
  Users,
  Shield,
  Zap,
  BookOpen,
  HelpCircle,
  Github,
  Twitter,
  Linkedin,
  FileText,
  Calendar,
  Globe
} from 'lucide-react';

export const metadata: Metadata = {
  title: 'Contact | Recoder.xyz',
  description: 'Reach the Recoder team for support, documentation, product questions, or security disclosures.',
  openGraph: {
    title: 'Contact | Recoder.xyz',
    description: 'Support, docs, product questions, and security reporting for Recoder.',
    url: 'https://recoder.xyz/contact',
    siteName: 'Recoder.xyz',
    images: [
      {
        url: 'https://recoder.xyz/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Contact Recoder - Support & Sales',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Contact | Recoder.xyz',
    description: 'Support, docs, product questions, and security reporting for Recoder.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/contact',
  },
};

export default function ContactPage() {
  const contactMethods = [
    {
      icon: BookOpen,
      title: 'Getting Started Docs',
      description: 'Start with the docs, setup guide, and onboarding path.',
      availability: 'Any time',
      response: 'Self-serve',
      action: 'Open Docs',
      href: '/docs/getting-started',
      priority: 'default'
    },
    {
      icon: Mail,
      title: 'Email Support',
      description: 'Product questions, account help, and technical issues.',
      availability: 'Async',
      response: 'As available',
      action: 'Send Email',
      href: 'mailto:support@recoder.xyz',
      priority: 'secondary'
    },
    {
      icon: Shield,
      title: 'Security Reporting',
      description: 'Responsible disclosure and security questions.',
      availability: 'Async',
      response: 'As available',
      action: 'Email Security',
      href: 'mailto:security@recoder.xyz',
      priority: 'secondary'
    },
    {
      icon: Github,
      title: 'GitHub',
      description: 'Follow development and public repo activity.',
      availability: 'Any time',
      response: 'Public',
      action: 'Open GitHub',
      href: 'https://github.com/recoderxyz',
      priority: 'outline'
    }
  ];

  const departments = [
    {
      name: 'General Support',
      email: 'support@recoder.xyz',
      description: 'Technical issues, product questions, and general inquiries',
      icon: Headphones,
      hours: 'Async'
    },
    {
      name: 'Security',
      email: 'security@recoder.xyz', 
      description: 'Security reports, trust questions, and responsible disclosure',
      icon: Shield,
      hours: 'Async'
    },
    {
      name: 'Docs & Onboarding',
      email: 'support@recoder.xyz',
      description: 'Getting-started help and product setup questions',
      icon: Users,
      hours: 'Async'
    },
    {
      name: 'Product',
      email: 'support@recoder.xyz',
      description: 'Feedback, roadmap questions, and integration requests',
      icon: Zap,
      hours: 'Async'
    }
  ];

  const offices = [
    {
      name: 'Remote-first team',
      address: 'Recoder operates as a distributed product team.\nUse the support and security channels on this page for contact.',
      phone: 'No public phone support',
      email: 'support@recoder.xyz',
      hours: 'Async support',
      timezone: 'Global / remote'
    }
  ];

  const faqs = [
    {
      question: 'How quickly do you respond to support requests?',
      answer: 'Support is handled asynchronously. For the fastest route, start with the docs and email support@recoder.xyz with the relevant details.'
    },
    {
      question: 'Do you offer phone support?',
      answer: 'Recoder does not advertise public phone support on the main site. Use email support or security reporting channels instead.'
    },
    {
      question: 'Can I schedule a demo or consultation?',
      answer: 'Start with the getting-started docs and email support@recoder.xyz if you need a product or onboarding conversation.'
    },
    {
      question: 'How do I report a security issue?',
      answer: 'Please email security@recoder.xyz with a clear report, impact summary, and reproduction details if available.'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      <SiteHeader fixed={false} />

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-slate-900 via-orange-600 to-slate-900 dark:from-white dark:via-orange-400 dark:to-white bg-clip-text text-transparent">
            Get in Touch
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-12 max-w-3xl mx-auto">
            We're here to help! Whether you have questions, need support, or want to explore how Recoder can transform your development workflow, our team is ready to assist.
          </p>
          
          {/* Quick Stats */}
          <div className="grid md:grid-cols-3 gap-6 mb-12">
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
              <div className="text-2xl font-bold text-blue-600 mb-2">&lt; 1 Hour</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">Critical Issue Response</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
              <div className="text-2xl font-bold text-green-600 mb-2">24/7</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">Live Chat Support</div>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-lg p-6 shadow-lg">
              <div className="text-2xl font-bold text-purple-600 mb-2">98%</div>
              <div className="text-sm text-slate-600 dark:text-slate-300">Customer Satisfaction</div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Methods */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How Can We Help?</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Choose the best way to reach us based on your needs
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {contactMethods.map((method, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-105">
                <CardHeader className="text-center">
                  <div className="w-12 h-12 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <method.icon className="w-6 h-6 text-white" />
                  </div>
                  <CardTitle className="text-lg">{method.title}</CardTitle>
                  <CardDescription className="text-sm">{method.description}</CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="space-y-2 mb-6">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Availability:</span>
                      <span className="font-medium">{method.availability}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Response:</span>
                      <span className="font-medium">{method.response}</span>
                    </div>
                  </div>
                  <Button 
                    variant={method.priority as 'default' | 'secondary' | 'outline'}
                    className="w-full" 
                    asChild
                  >
                    <Link href={method.href}>
                      {method.action}
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Contact Form */}
      <section className="py-16 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Send us a Message</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Fill out the form below and we'll get back to you within 4 hours
            </p>
          </div>
          
          <Card className="border-0 shadow-xl">
            <CardContent className="p-8">
              <form className="space-y-6">
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">First Name *</label>
                    <Input placeholder="Enter your first name" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Last Name *</label>
                    <Input placeholder="Enter your last name" required />
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium mb-2">Email Address *</label>
                    <Input type="email" placeholder="your.email@company.com" required />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Company</label>
                    <Input placeholder="Your company name" />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Subject *</label>
                  <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Select a topic</option>
                    <option>General Support</option>
                    <option>Technical Issue</option>
                    <option>Billing Question</option>
                    <option>Sales Inquiry</option>
                    <option>Partnership</option>
                    <option>Security Report</option>
                    <option>Feature Request</option>
                    <option>Other</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">Message *</label>
                  <textarea 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Describe your question or issue in detail..."
                    rows={6}
                    required
                  />
                </div>
                
                <div className="flex items-center space-x-2">
                  <input type="checkbox" id="updates" className="rounded" />
                  <label htmlFor="updates" className="text-sm text-slate-600 dark:text-slate-300">
                    I'd like to receive product updates and company news via email
                  </label>
                </div>
                
                <Button size="lg" className="w-full">
                  <Send className="w-4 h-4 mr-2" />
                  Send Message
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Departments */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Contact by Department</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Reach the right team for faster, more specialized assistance
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {departments.map((dept, index) => (
              <Card key={index} className="border-0 shadow-lg hover:shadow-xl transition-all duration-300">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-10 h-10 bg-gradient-to-r from-orange-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <dept.icon className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-1">{dept.name}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{dept.description}</p>
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium">{dept.email}</div>
                          <div className="text-xs text-slate-500">{dept.hours}</div>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`mailto:${dept.email}`}>
                            Contact
                          </Link>
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Office Locations */}
      <section className="py-16 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto max-w-6xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Our Offices</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Global presence with local support for our international customers
            </p>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
            {offices.map((office, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center space-x-2">
                    <MapPin className="w-5 h-5 text-blue-500" />
                    <span>{office.name}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-1">Address</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">
                        {office.address}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium mb-1">Phone</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{office.phone}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-1">Email</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{office.email}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium mb-1">Hours</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{office.hours}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium mb-1">Timezone</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300">{office.timezone}</div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-4xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Frequently Asked Questions</h2>
            <p className="text-xl text-slate-600 dark:text-slate-300">
              Quick answers to common questions about our support
            </p>
          </div>
          
          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <Card key={index} className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <h3 className="font-semibold text-lg mb-2 flex items-center">
                    <HelpCircle className="w-5 h-5 text-blue-500 mr-2" />
                    {faq.question}
                  </h3>
                  <p className="text-slate-600 dark:text-slate-300">{faq.answer}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          
          <div className="text-center mt-12">
            <Button variant="outline" asChild>
              <Link href="/docs/faq">
                View All FAQs
                <ArrowRight className="w-4 h-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Social & Community */}
      <section className="py-16 px-4 bg-gradient-to-r from-orange-500 to-purple-600">
        <div className="container mx-auto max-w-4xl text-center text-white">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">Join Our Community</h2>
          <p className="text-lg opacity-90 mb-8">
            Connect with other developers, get updates, and share feedback on our social channels
          </p>
          
          <div className="flex justify-center space-x-6 mb-8">
            <Button variant="secondary" size="lg" asChild>
              <Link href="https://github.com/recoder-xyz">
                <Github className="w-5 h-5 mr-2" />
                GitHub
              </Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="https://twitter.com/recoderxyz">
                <Twitter className="w-5 h-5 mr-2" />
                Twitter
              </Link>
            </Button>
            <Button variant="secondary" size="lg" asChild>
              <Link href="https://linkedin.com/company/recoder-xyz">
                <Linkedin className="w-5 h-5 mr-2" />
                LinkedIn
              </Link>
            </Button>
          </div>
          
          <div className="flex justify-center space-x-8 text-sm opacity-75">
            <Link href="/docs" className="hover:opacity-100 transition-opacity">
              <FileText className="w-4 h-4 inline mr-1" />
              Documentation
            </Link>
            <Link href="/blog" className="hover:opacity-100 transition-opacity">
              <MessageSquare className="w-4 h-4 inline mr-1" />
              Blog
            </Link>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
