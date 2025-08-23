import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  BookOpen, 
  Terminal, 
  Globe, 
  MessageSquare, 
  Code2, 
  Rocket,
  ArrowRight,
  FileText,
  Video,
  Github
} from 'lucide-react';

export default function DocsPage() {
  const docSections = [
    {
      title: 'Getting Started',
      description: 'Quick setup guides and first steps with Recoder',
      icon: Rocket,
      articles: [
        { title: 'Installation Guide', href: '/docs/installation', status: 'available' },
        { title: 'First Project', href: '/docs/first-project', status: 'available' },
        { title: 'Authentication Setup', href: '/docs/auth-setup', status: 'available' },
        { title: 'API Keys Configuration', href: '/docs/api-keys', status: 'available' }
      ]
    },
    {
      title: 'CLI Documentation',
      description: 'Complete reference for the Recoder CLI',
      icon: Terminal,
      articles: [
        { title: 'CLI Commands Reference', href: '/docs/cli/commands', status: 'available' },
        { title: 'Natural Language Interface', href: '/docs/cli/natural-language', status: 'available' },
        { title: 'Multi-AI Integration', href: '/docs/cli/multi-ai', status: 'available' },
        { title: 'Project Templates', href: '/docs/cli/templates', status: 'coming-soon' }
      ]
    },
    {
      title: 'Web Platform',
      description: 'Using the web-based development environment',
      icon: Globe,
      articles: [
        { title: 'Platform Overview', href: '/docs/web/overview', status: 'available' },
        { title: 'Code Generation', href: '/docs/web/code-generation', status: 'available' },
        { title: 'Real-time Collaboration', href: '/docs/web/collaboration', status: 'available' },
        { title: 'Deployment Pipeline', href: '/docs/web/deployment', status: 'coming-soon' }
      ]
    },
    {
      title: 'Chat Platform',
      description: 'AI-powered chat interface for development',
      icon: MessageSquare,
      articles: [
        { title: 'Chat Interface Guide', href: '/docs/chat/interface', status: 'available' },
        { title: 'Artifact Generation', href: '/docs/chat/artifacts', status: 'available' },
        { title: 'Context Management', href: '/docs/chat/context', status: 'available' },
        { title: 'Custom Prompts', href: '/docs/chat/prompts', status: 'coming-soon' }
      ]
    },
    {
      title: 'AI Providers',
      description: 'Working with different AI models and providers',
      icon: Code2,
      articles: [
        { title: 'Supported Providers', href: '/docs/ai/providers', status: 'available' },
        { title: 'Model Selection', href: '/docs/ai/model-selection', status: 'available' },
        { title: 'Custom Models', href: '/docs/ai/custom-models', status: 'available' },
        { title: 'Local AI Setup (Ollama)', href: '/docs/ai/local-setup', status: 'available' }
      ]
    },
    {
      title: 'API Reference',
      description: 'Complete API documentation for developers',
      icon: FileText,
      articles: [
        { title: 'REST API Overview', href: '/docs/api/rest', status: 'available' },
        { title: 'Authentication', href: '/docs/api/auth', status: 'available' },
        { title: 'WebSocket Events', href: '/docs/api/websocket', status: 'available' },
        { title: 'Rate Limits', href: '/docs/api/rate-limits', status: 'available' }
      ]
    }
  ];

  const quickLinks = [
    { title: 'Install CLI', href: '/cli', icon: Terminal, description: 'Get started with the command line' },
    { title: 'Open Web Platform', href: '/platform/web', icon: Globe, description: 'Launch the web interface' },
    { title: 'Join Chat', href: '/platform/chat', icon: MessageSquare, description: 'Start AI-powered conversations' },
    { title: 'View Examples', href: 'https://github.com/recoderxyz/examples', icon: Github, description: 'Explore code examples' }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-800">
      {/* Header */}
      <section className="pt-20 pb-16 px-4">
        <div className="container mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-4 py-2 rounded-full text-sm font-medium mb-6">
            <BookOpen className="w-4 h-4" />
            Documentation Hub
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-6">
            Recoder Documentation
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-2xl mx-auto">
            Everything you need to build production-ready applications with AI-powered development tools.
          </p>

          {/* Quick Links */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto mb-12">
            {quickLinks.map((link, index) => {
              const Icon = link.icon;
              return (
                <Button key={index} variant="outline" size="lg" asChild className="h-auto p-4 flex flex-col gap-2">
                  <Link href={link.href}>
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{link.title}</span>
                    <span className="text-xs text-muted-foreground">{link.description}</span>
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Documentation Sections */}
      <section className="pb-20 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {docSections.map((section, index) => {
              const Icon = section.icon;
              return (
                <Card key={index} className="group hover:shadow-lg transition-all duration-300">
                  <CardHeader>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                        <Icon className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{section.title}</CardTitle>
                      </div>
                    </div>
                    <CardDescription>{section.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {section.articles.map((article, articleIndex) => (
                        <div key={articleIndex} className="flex items-center justify-between py-2">
                          <Link 
                            href={article.href}
                            className="flex items-center gap-2 text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            <span>{article.title}</span>
                            <ArrowRight className="w-3 h-3" />
                          </Link>
                          <Badge variant={article.status === 'available' ? 'default' : 'secondary'} className="text-xs">
                            {article.status === 'available' ? 'Available' : 'Coming Soon'}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Additional Resources */}
          <div className="mt-16 text-center">
            <h2 className="text-2xl font-bold mb-6">Additional Resources</h2>
            <div className="grid sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
              <Card>
                <CardHeader>
                  <Video className="w-8 h-8 mx-auto text-red-500" />
                  <CardTitle className="text-lg">Video Tutorials</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Step-by-step video guides for common workflows
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/docs/videos">Watch Tutorials</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <Github className="w-8 h-8 mx-auto text-gray-700 dark:text-gray-300" />
                  <CardTitle className="text-lg">Examples</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Real-world examples and starter templates
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="https://github.com/recoderxyz/examples" target="_blank">
                      View Examples
                    </Link>
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <MessageSquare className="w-8 h-8 mx-auto text-blue-500" />
                  <CardTitle className="text-lg">Community</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Join discussions and get help from the community
                  </p>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/community">Join Community</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}