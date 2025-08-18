import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Terminal, 
  Download,
  Copy,
  CheckCircle,
  ArrowRight,
  ExternalLink,
  Zap,
  Shield,
  Globe
} from 'lucide-react';

export default function CLIPage() {
  const installSteps = [
    {
      title: "Install Recoder CLI Router",
      code: "npm install -g recoder-cli-router",
      description: "Install the CLI router that handles AI model routing and authentication"
    },
    {
      title: "Verify CLI Router Installation",
      code: "node dist/cli.js --help",
      description: "Test that the CLI router is working (from the installation directory)"
    },
    {
      title: "Install Recoder CLI",
      code: "npm install -g @recoder/cli",
      description: "Install the main CLI for code generation and AI assistance"
    },
    {
      title: "Authenticate with Recoder.xyz",
      code: "recoder auth login",
      description: "Connect to your Recoder.xyz account (like Claude Code authentication)"
    },
    {
      title: "Start Building",
      code: 'recoder generate "create a React app with TypeScript"',
      description: "Generate real, production-ready code using AI"
    }
  ];

  const features = [
    {
      icon: Zap,
      title: "Multi-AI Intelligence",
      description: "Automatically routes requests to the best AI model (Claude, Groq, Gemini, etc.)"
    },
    {
      icon: Shield,
      title: "No API Keys Required",
      description: "Authentication through Recoder.xyz - no need to manage API keys"
    },
    {
      icon: Globe,
      title: "Production Ready",
      description: "Generates real, working code that you can deploy immediately"
    }
  ];

  const commands = [
    {
      command: "recoder generate",
      description: "Generate full applications or components",
      example: 'recoder generate "Solana DEX with token swapping"'
    },
    {
      command: "recoder chat",
      description: "Interactive AI chat for coding assistance",
      example: "recoder chat"
    },
    {
      command: "recoder plan",
      description: "Create detailed project plans with architecture",
      example: 'recoder plan "microservices e-commerce platform"'
    },
    {
      command: "recoder validate",
      description: "Validate generated code for production readiness",
      example: "recoder validate ./my-project"
    },
    {
      command: "recoder refactor",
      description: "Repository-wide refactoring with full context",
      example: 'recoder refactor "modernize to React 18"'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm dark:bg-slate-900/80">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="flex items-center space-x-2">
              <Terminal className="w-8 h-8 text-blue-600" />
              <span className="text-xl font-bold">Recoder CLI</span>
            </Link>
            <Button asChild>
              <Link href="/auth/signin">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4">
        <div className="container mx-auto text-center">
          <Badge variant="secondary" className="mb-4">
            🚀 Production-Ready AI CLI
          </Badge>
          <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-600 via-purple-600 to-blue-800 bg-clip-text text-transparent">
            Recoder CLI
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300 mb-8 max-w-3xl mx-auto">
            The most powerful AI-powered CLI for developers. Generate real, production-ready code 
            with multi-AI intelligence and seamless Recoder.xyz integration.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Button size="lg" asChild>
              <Link href="#install" className="flex items-center space-x-2">
                <Download className="w-5 h-5" />
                <span>Install Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="https://github.com/recoderxyz/recoder-cli" className="flex items-center space-x-2">
                <ExternalLink className="w-5 h-5" />
                <span>View on GitHub</span>
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Why Recoder CLI?</h2>
          <div className="grid md:grid-cols-3 gap-8">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <div key={index} className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Icon className="w-8 h-8 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold mb-4">{feature.title}</h3>
                  <p className="text-slate-600 dark:text-slate-300">{feature.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Installation */}
      <section id="install" className="py-20 px-4">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Quick Installation</h2>
          <div className="max-w-4xl mx-auto">
            <div className="grid gap-6">
              {installSteps.map((step, index) => (
                <Card key={index} className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center font-semibold text-sm">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-lg mb-2">{step.title}</h3>
                      <p className="text-slate-600 dark:text-slate-300 mb-4">{step.description}</p>
                      <div className="bg-slate-900 dark:bg-slate-800 p-4 rounded-lg flex items-center justify-between">
                        <code className="text-green-400 font-mono">{step.code}</code>
                        <Button size="sm" variant="outline" className="ml-4">
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>

            <div className="mt-12 p-6 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-start space-x-3">
                <CheckCircle className="w-6 h-6 text-blue-600 mt-1" />
                <div>
                  <h4 className="font-semibold text-blue-900 dark:text-blue-100 mb-2">
                    Authentication Like Claude Code
                  </h4>
                  <p className="text-blue-800 dark:text-blue-200">
                    Just like Claude Code, you authenticate once with your Recoder.xyz account and get access to all AI models. 
                    No need to manage multiple API keys!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Commands */}
      <section className="py-20 px-4 bg-white/50 dark:bg-slate-800/50">
        <div className="container mx-auto">
          <h2 className="text-3xl font-bold text-center mb-12">Powerful Commands</h2>
          <div className="max-w-4xl mx-auto">
            <div className="grid gap-4">
              {commands.map((cmd, index) => (
                <Card key={index} className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div className="mb-4 md:mb-0">
                      <h3 className="font-semibold text-lg mb-2">
                        <code className="text-blue-600">{cmd.command}</code>
                      </h3>
                      <p className="text-slate-600 dark:text-slate-300">{cmd.description}</p>
                    </div>
                    <div className="bg-slate-900 dark:bg-slate-800 p-3 rounded-lg min-w-0 md:min-w-[300px]">
                      <code className="text-green-400 font-mono text-sm">{cmd.example}</code>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="container mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">
            Ready to Supercharge Your Development?
          </h2>
          <p className="text-xl text-blue-100 mb-8 max-w-2xl mx-auto">
            Install Recoder CLI now and start building production-ready applications with AI assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" variant="secondary" asChild>
              <Link href="/auth/signin" className="flex items-center space-x-2">
                <span>Get Started Now</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" className="bg-transparent border-white text-white hover:bg-white hover:text-blue-600" asChild>
              <Link href="/docs" className="flex items-center space-x-2">
                <span>Read Documentation</span>
                <ExternalLink className="w-4 h-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}