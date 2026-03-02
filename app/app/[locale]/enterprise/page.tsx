import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  Shield,
  Server,
  FileCheck,
  Headphones,
  Cpu,
  Users,
  Clock,
  Plug,
  ArrowRight,
  Building2,
  CheckCircle,
  Zap,
  Phone,
  Calendar,
} from 'lucide-react';

const ENTERPRISE_FEATURES = [
  {
    icon: Shield,
    title: 'SSO & SAML',
    description:
      'Single sign-on integration with any identity provider. SAML 2.0, OIDC, and SCIM provisioning for seamless team onboarding.',
  },
  {
    icon: Server,
    title: 'Self-Hosted Option',
    description:
      'Deploy on your own infrastructure with full control. AWS, Azure, GCP, or on-premises with dedicated VPC environments.',
  },
  {
    icon: FileCheck,
    title: 'SOC 2 & GDPR Compliance',
    description:
      'Enterprise security and data governance. SOC 2 Type II certified, ISO 27001 compliant, GDPR ready, and HIPAA eligible.',
  },
  {
    icon: Headphones,
    title: 'Dedicated Support',
    description:
      'Priority support with SLA guarantees. Dedicated customer success manager, 24/7 phone and video support, custom onboarding.',
  },
  {
    icon: Cpu,
    title: 'Custom AI Models',
    description:
      'Bring your own models or use 40+ included models. GPT-4, Claude, Gemini, Llama, Mistral, and more with custom fine-tuning support.',
  },
  {
    icon: Users,
    title: 'Team Management',
    description:
      'Role-based access control, granular permissions, comprehensive audit logs, usage analytics, and bulk user management.',
  },
  {
    icon: Clock,
    title: '99.99% Uptime SLA',
    description:
      'Enterprise reliability guarantee backed by SLA. Redundant infrastructure, automatic failover, and disaster recovery built in.',
  },
  {
    icon: Plug,
    title: 'Custom Integrations',
    description:
      'Full API access, webhooks, CI/CD pipeline integration. Connect to GitHub, GitLab, Jira, Slack, and your internal tools.',
  },
];

const SCALE_STATS = [
  { value: 'Unlimited', label: 'Team Seats', description: 'No per-seat limits on any plan' },
  { value: 'Unlimited', label: 'Projects', description: 'Create as many as you need' },
  { value: '40+', label: 'AI Models', description: 'Or bring your own models' },
];

const COMPLIANCE_ITEMS = [
  { name: 'SOC 2 Type II', status: 'Certified' },
  { name: 'ISO 27001', status: 'Compliant' },
  { name: 'GDPR', status: 'Compliant' },
  { name: 'HIPAA', status: 'Eligible' },
  { name: 'AES-256 Encryption', status: 'At Rest & In Transit' },
  { name: 'Penetration Testing', status: 'Quarterly' },
];

const HOW_IT_WORKS_STEPS = [
  {
    step: 1,
    title: 'Talk to Sales',
    description:
      'Share your requirements with our enterprise team. We will understand your security, compliance, and deployment needs.',
  },
  {
    step: 2,
    title: 'Custom Setup',
    description:
      'We configure SSO, deploy to your infrastructure, set up custom models, and integrate with your existing tools.',
  },
  {
    step: 3,
    title: 'Deploy & Scale',
    description:
      'Your team starts building with AI immediately. We provide ongoing support, training, and optimization.',
  },
];


export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader fixed={false} />

      {/* Hero Section */}
      <section className="pt-24 pb-16 px-6">
        <div className="container mx-auto max-w-5xl text-center">
          <div className="inline-flex items-center space-x-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full mb-8">
            <Building2 className="w-4 h-4 text-purple-400" />
            <span className="text-sm text-purple-300">Enterprise</span>
          </div>
          <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight">
            Enterprise-grade{' '}
            <br className="hidden md:block" />
            <span className="bg-gradient-to-r from-orange-500 via-purple-500 to-orange-500 bg-clip-text text-transparent">
              AI development
            </span>
          </h1>
          <p className="text-xl md:text-2xl text-gray-400 max-w-3xl mx-auto leading-relaxed">
            Secure, scalable, compliant. The AI development platform built for
            organizations that demand the highest standards.
          </p>

          {/* Trust indicators */}
          <div className="flex flex-wrap justify-center gap-6 mt-10">
            {['SOC 2 Type II', 'ISO 27001', 'GDPR Compliant', '99.99% Uptime'].map((item) => (
              <div
                key={item}
                className="flex items-center space-x-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full"
              >
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-gray-300">{item}</span>
              </div>
            ))}
          </div>

          {/* Hero CTAs */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-12">
            <Link
              href="/contact"
              className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center space-x-2 shadow-lg shadow-orange-500/25"
            >
              <Phone className="w-5 h-5" />
              <span>Contact Sales</span>
            </Link>
            <Link
              href="/contact"
              className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all hover:bg-white/5 flex items-center space-x-2"
            >
              <Calendar className="w-5 h-5" />
              <span>Book a Demo</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Enterprise Features Grid */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-7xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-orange-500/10 border border-orange-500/20 rounded-full mb-6">
              <Zap className="w-4 h-4 text-orange-400" />
              <span className="text-sm text-orange-300">Enterprise Features</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Everything your organization needs
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Purpose-built for teams that require security, compliance, and control
              without compromising on developer experience.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {ENTERPRISE_FEATURES.map((feature) => (
              <div
                key={feature.title}
                className="group relative flex flex-col rounded-2xl border border-white/10 bg-white/[0.02] p-6 transition-all hover:border-white/20 hover:bg-white/[0.04]"
              >
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-purple-500/20 border border-white/10 flex items-center justify-center mb-4 group-hover:border-orange-500/30 transition-colors">
                  <feature.icon className="w-6 h-6 text-orange-400" />
                </div>
                <h3 className="text-lg font-bold mb-2">{feature.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Scale Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="relative rounded-3xl border border-white/10 bg-gradient-to-br from-orange-500/5 via-purple-500/5 to-transparent p-12 overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-purple-500/10 blur-3xl pointer-events-none" />

            <div className="relative text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Built for teams of any size</h2>
              <p className="text-lg text-gray-400 max-w-2xl mx-auto">
                From 10-person startups to 50,000-employee enterprises. No artificial limits,
                no per-seat pricing games.
              </p>
            </div>

            <div className="relative grid grid-cols-1 md:grid-cols-3 gap-8">
              {SCALE_STATS.map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-5xl font-bold bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent mb-2">
                    {stat.value}
                  </div>
                  <div className="text-lg font-semibold text-white mb-1">{stat.label}</div>
                  <div className="text-sm text-gray-500">{stat.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Security & Compliance Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <div className="inline-flex items-center space-x-2 px-4 py-2 bg-green-500/10 border border-green-500/20 rounded-full mb-6">
              <Shield className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-300">Security & Compliance</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold mb-4">
              Security you can trust
            </h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Industry-leading certifications and security practices. Your code and data
              are protected at every layer.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {COMPLIANCE_ITEMS.map((item, index) => (
                <div
                  key={item.name}
                  className={`flex items-center gap-4 p-6 ${
                    index < COMPLIANCE_ITEMS.length - (COMPLIANCE_ITEMS.length % 3 || 3)
                      ? 'border-b border-white/10'
                      : ''
                  } ${(index + 1) % 3 !== 0 ? 'lg:border-r lg:border-white/10' : ''}`}
                >
                  <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                  <div>
                    <div className="font-semibold text-white">{item.name}</div>
                    <div className="text-sm text-gray-500">{item.status}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 text-center">
            <Link
              href="/security"
              className="inline-flex items-center gap-2 text-sm text-orange-400 hover:text-orange-300 transition-colors"
            >
              View full Security Center
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-5xl">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">How it works</h2>
            <p className="text-lg text-gray-400 max-w-2xl mx-auto">
              Get your entire organization onboarded in days, not months.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {HOW_IT_WORKS_STEPS.map((step) => (
              <div key={step.step} className="relative">
                {/* Connector line */}
                {step.step < 3 && (
                  <div className="hidden md:block absolute top-8 left-[calc(50%+2rem)] w-[calc(100%-4rem)] h-px bg-gradient-to-r from-orange-500/40 to-purple-500/40" />
                )}
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500 to-purple-600 text-2xl font-bold mb-6 shadow-lg shadow-orange-500/25">
                    {step.step}
                  </div>
                  <h3 className="text-xl font-bold mb-3">{step.title}</h3>
                  <p className="text-gray-400 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-24 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="relative rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/10 via-purple-500/10 to-transparent p-12 text-center overflow-hidden">
            {/* Background glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/5 via-purple-500/10 to-orange-500/5 blur-3xl pointer-events-none" />

            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                Ready to bring AI development to your organization?
              </h2>
              <p className="text-lg text-gray-400 mb-10 max-w-2xl mx-auto">
                Recoder is currently in beta with enterprise features on the roadmap.
                Contact us to discuss your organization&apos;s needs.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link
                  href="/contact"
                  className="px-8 py-4 text-lg font-semibold bg-gradient-to-r from-orange-500 to-purple-600 hover:from-orange-600 hover:to-purple-700 rounded-xl transition-all transform hover:scale-105 flex items-center justify-center space-x-2 shadow-lg shadow-orange-500/25"
                >
                  <Phone className="w-5 h-5" />
                  <span>Contact Sales</span>
                </Link>
                <Link
                  href="/contact"
                  className="px-8 py-4 text-lg font-semibold border border-white/20 hover:border-white/40 rounded-xl transition-all hover:bg-white/5 flex items-center justify-center space-x-2"
                >
                  <Calendar className="w-5 h-5" />
                  <span>Book a Demo</span>
                </Link>
              </div>
              <p className="text-sm text-gray-500 mt-6">
                Or email us directly at{' '}
                <a
                  href="mailto:enterprise@recoder.xyz"
                  className="text-orange-400 hover:text-orange-300 transition-colors"
                >
                  enterprise@recoder.xyz
                </a>
              </p>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
