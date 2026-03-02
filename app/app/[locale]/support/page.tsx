/**
 * Support & Help Center
 * Help documentation and contact support
 */

'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  Search,
  MessageSquare,
  Mail,
  Book,
  Video,
  FileText,
  ExternalLink,
  Send,
  Clock,
  CheckCircle,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export default function SupportPage() {
  const [searchQuery, setSearchQuery] = useState('');
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    priority: 'normal'
  });
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const quickLinks = [
    {
      title: 'Getting Started',
      description: 'Learn the basics and set up your account',
      icon: Book,
      href: '/docs/getting-started'
    },
    {
      title: 'API Documentation',
      description: 'Explore our API endpoints and examples',
      icon: FileText,
      href: '/docs/api'
    },
    {
      title: 'Video Tutorials',
      description: 'Watch step-by-step video guides',
      icon: Video,
      href: '/learn'
    },
    {
      title: 'Community Forum',
      description: 'Connect with other developers',
      icon: MessageSquare,
      href: 'https://community.recoder.xyz'
    }
  ];

  const faqs = [
    {
      question: 'How do I get started with Recoder?',
      answer: 'Sign up for a free account, complete the onboarding flow, and choose your preferred platform (Web, CLI, or Extension). You\'ll get 6 free requests per day to start.'
    },
    {
      question: 'What AI models are available?',
      answer: 'We provide access to 50+ AI models including Claude 3, GPT-4, Gemini Pro, Llama 3, and more. Each model has different strengths for various tasks.'
    },
    {
      question: 'How does billing work?',
      answer: 'We offer a free tier with 6 requests/day. Pro plan ($29/month) includes unlimited requests. Enterprise plans start at $99/month with custom features.'
    },
    {
      question: 'Can I use my own API keys?',
      answer: 'Yes! Pro and Enterprise users can bring their own OpenRouter API keys for unlimited usage without going through our quota system.'
    },
    {
      question: 'Is my code and data secure?',
      answer: 'Absolutely. We use end-to-end encryption, never store your code permanently, and are compliant with SOC 2, GDPR, and HIPAA standards.'
    },
    {
      question: 'Do you offer team features?',
      answer: 'Yes! Team collaboration, shared projects, role management, and team billing are available on Pro and Enterprise plans.'
    }
  ];

  const supportOptions = [
    {
      title: 'Email Support',
      description: 'Get help via email within 24 hours',
      icon: Mail,
      time: 'Response in 24h',
      action: 'Send Email',
      href: 'mailto:support@recoder.xyz'
    },
    {
      title: 'Live Chat',
      description: 'Chat with our support team in real-time',
      icon: MessageSquare,
      time: 'Available 9am-5pm EST',
      action: 'Start Chat',
      href: '#chat'
    },
    {
      title: 'Documentation',
      description: 'Browse comprehensive guides and tutorials',
      icon: Book,
      time: 'Always available',
      action: 'View Docs',
      href: '/docs'
    }
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactForm),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.error || 'Failed to send support request');
      }

      setFormSubmitted(true);
      setContactForm({ name: '', email: '', subject: '', message: '', priority: 'normal' });
      setTimeout(() => setFormSubmitted(false), 3000);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Failed to send support request');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      <div className="container mx-auto px-6 py-24">
        <div className="max-w-6xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4">How can we help you?</h1>
            <p className="text-xl text-gray-400 mb-8">
              Search our knowledge base or get in touch with support
            </p>

            {/* Search */}
            <div className="max-w-2xl mx-auto relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search for help..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-4 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 text-white text-lg"
              />
            </div>
          </div>

          {/* Quick Links */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            {quickLinks.map((link, index) => {
              const Icon = link.icon;
              return (
                <Link
                  key={index}
                  href={link.href}
                  className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl hover:border-white/20 transition-all group"
                >
                  <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-purple-600 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-bold mb-2">{link.title}</h3>
                  <p className="text-sm text-gray-400">{link.description}</p>
                </Link>
              );
            })}
          </div>

          {/* Support Options */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Get Support</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {supportOptions.map((option, index) => {
                const Icon = option.icon;
                return (
                  <div
                    key={index}
                    className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl"
                  >
                    <Icon className="w-8 h-8 text-orange-500 mb-4" />
                    <h3 className="text-lg font-bold mb-2">{option.title}</h3>
                    <p className="text-sm text-gray-400 mb-4">{option.description}</p>
                    <div className="flex items-center space-x-2 text-sm text-gray-500 mb-4">
                      <Clock className="w-4 h-4" />
                      <span>{option.time}</span>
                    </div>
                    <Link
                      href={option.href}
                      className="w-full px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg font-medium transition-all flex items-center justify-center space-x-2"
                    >
                      <span>{option.action}</span>
                      <ExternalLink className="w-4 h-4" />
                    </Link>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Contact Form */}
          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
              <h2 className="text-2xl font-bold mb-6">Send us a message</h2>
              
              {formSubmitted ? (
                <div className="py-12 text-center">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-xl font-bold mb-2">Message Sent!</h3>
                  <p className="text-gray-400">We'll get back to you within 24 hours.</p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  {submitError && (
                    <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200 flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Name
                    </label>
                    <input
                      type="text"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email
                    </label>
                    <input
                      type="email"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Priority
                    </label>
                    <select
                      value={contactForm.priority}
                      onChange={(e) => setContactForm({ ...contactForm, priority: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white appearance-none"
                    >
                      <option value="low" className="bg-gray-900">Low</option>
                      <option value="normal" className="bg-gray-900">Normal</option>
                      <option value="high" className="bg-gray-900">High</option>
                      <option value="urgent" className="bg-gray-900">Urgent</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Subject
                    </label>
                    <input
                      type="text"
                      required
                      value={contactForm.subject}
                      onChange={(e) => setContactForm({ ...contactForm, subject: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Message
                    </label>
                    <textarea
                      required
                      rows={6}
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-white resize-none"
                      placeholder="Tell us how we can help..."
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-lg font-medium transition-all flex items-center justify-center space-x-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    <Send className="w-4 h-4" />
                    <span>{isSubmitting ? 'Sending...' : 'Send Message'}</span>
                  </button>
                </form>
              )}
            </div>

            {/* FAQ */}
            <div>
              <h2 className="text-2xl font-bold mb-6">Frequently Asked Questions</h2>
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <details
                    key={index}
                    className="p-4 rounded-lg bg-white/5 border border-white/10 group"
                  >
                    <summary className="font-medium cursor-pointer flex items-center justify-between">
                      <span>{faq.question}</span>
                      <HelpCircle className="w-5 h-5 text-gray-400 group-open:text-orange-500" />
                    </summary>
                    <p className="mt-3 text-sm text-gray-400 leading-relaxed">
                      {faq.answer}
                    </p>
                  </details>
                ))}
              </div>
            </div>
          </div>

          {/* Status */}
          <div className="p-6 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold mb-1">System Status</h3>
                <p className="text-sm text-gray-400">All systems operational</p>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-500 font-medium">Operational</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
