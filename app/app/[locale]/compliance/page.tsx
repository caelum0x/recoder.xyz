'use client';

import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import {
  Shield, Lock, Eye, FileText,
  Globe, Building2, Users, AlertTriangle,
  Zap, ArrowRight, ExternalLink, FlaskConical,
  CheckCircle2, CircleDashed, XCircle,
} from 'lucide-react';

// Simple button component
const Button = ({ children, className = '', size = 'md', ...props }: any) => {
  const sizeClasses = {
    sm: 'px-3 py-2 text-sm',
    md: 'px-4 py-2',
    lg: 'px-6 py-3 text-lg'
  };

  return (
    <button
      className={`inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

/**
 * The public marketing "lead magnet" surface for the evidence engine. It lives
 * on the separate `site/` marketing app (see site/app/evidence-sample), not
 * this app — linked here by absolute URL since the two Next.js apps are
 * separate deployments on the same domain.
 */
const EVIDENCE_SAMPLE_URL = 'https://recoder.xyz/evidence-sample';

type PostureStatus = 'built' | 'in-progress' | 'not-held';

interface CompliancePosture {
  icon: typeof Shield;
  title: string;
  status: PostureStatus;
  statusLabel: string;
  description: string;
}

const STATUS_STYLE: Record<PostureStatus, string> = {
  built: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'in-progress': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'not-held': 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const STATUS_ICON: Record<PostureStatus, typeof CheckCircle2> = {
  built: CheckCircle2,
  'in-progress': CircleDashed,
  'not-held': XCircle,
};

export default function CompliancePage() {
  // Honest posture as of 2026-10-23 (ARCHITECTURE.md "Rung 6" ladder). We do
  // NOT claim a certification we have not been awarded by a third-party
  // auditor, and we do not link to a certificate PDF that does not exist.
  const posture: CompliancePosture[] = [
    {
      icon: Shield,
      title: 'SOC 2 Type II',
      status: 'not-held',
      statusLabel: 'Not certified',
      description:
        'We have not engaged a third-party auditor and do not hold a SOC 2 report. What we do have: every governed merge in Recoder emits a ConvergenceEvidence record whose controls are mapped to specific SOC 2 trust-service criteria (change management, change verification) — see the sample below.',
    },
    {
      icon: Building2,
      title: 'ISO 27001',
      status: 'not-held',
      statusLabel: 'Not certified',
      description:
        'No ISO 27001 certificate has been issued for Recoder. We are not actively pursuing certification today; this page will be updated the day that changes, with a real certificate, not before.',
    },
    {
      icon: Globe,
      title: 'GDPR',
      status: 'in-progress',
      statusLabel: 'Partially aligned',
      description:
        'Our privacy policy describes what we collect and why. We have not published a formal Data Processing Agreement or completed an external GDPR audit — contact us if your organization needs one reviewed before you can use Recoder.',
    },
    {
      icon: Users,
      title: 'EU AI Act',
      status: 'built',
      statusLabel: 'Evidence mapping built',
      description:
        'Every ConvergenceEvidence export maps to EU AI Act Art. 12 (record-keeping) and Art. 14 (human oversight) controls, deriving each control’s status truthfully from the record itself — never asserted as "met" without the backing field present.',
    },
    {
      icon: FileText,
      title: 'DORA',
      status: 'built',
      statusLabel: 'Evidence mapping built',
      description:
        'The same export maps to a DORA ICT-change-control check: was the change identified and verified before delivery. A change that was not pre-merge verified is marked "partial" with the real reason, not hidden.',
    },
    {
      icon: Lock,
      title: 'SSO / SAML / SCIM',
      status: 'not-held',
      statusLabel: 'Not built yet',
      description:
        'Enterprise identity federation is on our roadmap, not shipped. If your procurement process requires SSO/SAML/SCIM today, tell us — it tells us exactly what to build next.',
    },
  ];

  const dataProtection = [
    {
      title: 'Transport encryption',
      description: 'All traffic to Recoder is served over TLS.',
      icon: Lock,
      details: [
        'HTTPS enforced at the edge',
        'No plaintext API or dashboard traffic',
      ],
    },
    {
      title: 'Local-first by default',
      description: 'The desktop product runs agents and your code on your own machine.',
      icon: Globe,
      details: [
        'BYOK: you hold your own model-provider keys',
        'Git worktrees stay on your disk, not a Recoder server',
        'Enterprise: self-host the control plane in your own infra',
      ],
    },
    {
      title: 'Governed writes',
      description: 'Mutating actions pass through a governance gate before they execute.',
      icon: Eye,
      details: [
        'High-risk actions require a recorded approval',
        'A timed-out approval denies by default, never auto-allows',
        'We are actively closing gaps where some domains still bypass the gate (tracked internally)',
      ],
    },
    {
      title: 'Tamper-evident audit trail',
      description: 'Governed decisions are sealed into a SHA-256 Merkle chain.',
      icon: FileText,
      details: [
        'A quiet rewrite of a past decision is detectable',
        'Evidence records are independently content-hashed',
        'Optional Ed25519 signing over the evidence hash',
      ],
    },
  ];

  const policies = [
    {
      title: 'Privacy Policy',
      description: 'How we collect, use, and protect your personal information.',
      href: '/privacy',
      icon: FileText,
    },
    {
      title: 'Terms of Service',
      description: 'Legal terms governing the use of Recoder.xyz services.',
      href: '/terms',
      icon: FileText,
    },
    {
      title: 'Security overview',
      description: 'Our architecture, governance gate, and audit-trail design.',
      href: '/security',
      icon: Shield,
    },
    {
      title: 'Enterprise',
      description: 'Self-hosting, fleet governance, and what Enterprise adds today.',
      href: '/enterprise',
      icon: Building2,
    },
  ];

  const complianceProcess = [
    {
      step: 1,
      title: 'Every merge is evidenced',
      description: 'A governed merge always emits a content-hashed ConvergenceEvidence record — not an opt-in.',
      icon: FileText,
    },
    {
      step: 2,
      title: 'Controls derive truthfully',
      description: 'Each SOC 2 / EU AI Act / DORA control status is computed from the record’s own fields, never hardcoded to "met".',
      icon: Zap,
    },
    {
      step: 3,
      title: 'You can verify it yourself',
      description: 'Try it on a real PR diff and test output — no account, no certification claim, just the real engine.',
      icon: FlaskConical,
    },
    {
      step: 4,
      title: 'Formal certification is a separate, future step',
      description: 'A third-party SOC 2 / ISO 27001 audit is not required to use the evidence engine today, and we won’t claim one until it’s real.',
      icon: Shield,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <SiteHeader />
      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto text-center">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-6">
            Compliance evidence, honestly stated
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-12">
            Recoder does not hold SOC 2, ISO 27001, HIPAA, PCI DSS, or FedRAMP certifications.
            What it does have, running on every governed merge today, is a signed, content-hashed
            evidence record mapped to real SOC 2 / EU AI Act / DORA controls — and you can generate
            a sample from your own code right now.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={EVIDENCE_SAMPLE_URL}>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                <FlaskConical className="mr-2 h-5 w-5" />
                Generate a sample evidence record
              </Button>
            </a>
            <Link href="/security">
              <Button size="lg" className="bg-gray-600 hover:bg-gray-700 text-white">
                Read the security architecture
                <ExternalLink className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* Compliance posture */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-4">
            Current compliance posture
          </h2>
          <p className="text-center text-gray-600 dark:text-gray-300 max-w-2xl mx-auto mb-12">
            Each row is what is actually true today — not a target, not a claim pending an audit
            we have not booked.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {posture.map((item, index) => {
              const StatusIcon = STATUS_ICON[item.status];
              return (
                <div key={index} className="bg-gray-50 dark:bg-gray-900 rounded-xl shadow-lg p-6 border border-gray-100 dark:border-gray-700">
                  <div className="flex items-center justify-between mb-4">
                    <item.icon className="h-10 w-10 text-blue-600" />
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium ${STATUS_STYLE[item.status]}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {item.statusLabel}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{item.title}</h3>
                  <p className="text-gray-600 dark:text-gray-300 text-sm">{item.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Data Protection */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            How Recoder actually protects your code
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {dataProtection.map((protection, index) => (
              <div key={index} className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
                <div className="flex items-center mb-6">
                  <protection.icon className="h-12 w-12 text-purple-600 mr-4" />
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">{protection.title}</h3>
                    <p className="text-gray-600 dark:text-gray-300">{protection.description}</p>
                  </div>
                </div>
                <ul className="space-y-3">
                  {protection.details.map((detail, detailIndex) => (
                    <li key={detailIndex} className="flex items-start">
                      <CheckCircle2 className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-600 dark:text-gray-300">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Compliance Process */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            How the evidence engine works
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {complianceProcess.map((process, index) => (
              <div key={index} className="text-center">
                <div className="bg-neutral-800 border border-neutral-700 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
                  <process.icon className="h-8 w-8 text-white" />
                </div>
                <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center mx-auto mb-4">
                  <span className="font-bold">{process.step}</span>
                </div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">{process.title}</h3>
                <p className="text-gray-600 dark:text-gray-300">{process.description}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-12">
            <a href={EVIDENCE_SAMPLE_URL}>
              <Button size="lg" className="bg-blue-600 hover:bg-blue-700 text-white">
                Try it on a real diff
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </a>
          </div>
        </div>
      </section>

      {/* Legal Documents */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white dark:bg-gray-800">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-12">
            Legal & security pages
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {policies.map((policy, index) => (
              <Link key={index} href={policy.href} className="bg-gray-50 dark:bg-gray-700 rounded-xl p-6 block hover:ring-2 hover:ring-blue-500 transition-shadow">
                <policy.icon className="h-8 w-8 text-gray-600 dark:text-gray-300 mb-4" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">{policy.title}</h3>
                <p className="text-gray-600 dark:text-gray-300 text-sm mb-4">{policy.description}</p>
                <span className="inline-flex items-center text-sm font-medium text-blue-600 dark:text-blue-400">
                  Open page
                  <ArrowRight className="ml-1 h-4 w-4" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Security Incident Response */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8">
            <div className="text-center mb-8">
              <AlertTriangle className="h-16 w-16 text-orange-500 mx-auto mb-4" />
              <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
                Report a security issue
              </h2>
              <p className="text-xl text-gray-600 dark:text-gray-300">
                We do not publish a formal incident-response SLA today. Email us and we will
                respond — we would rather tell you that plainly than invent a response-time number.
              </p>
            </div>
            <div className="text-center mt-4">
              <a href="mailto:security@recoder.xyz">
                <Button className="bg-red-600 hover:bg-red-700 text-white">
                  security@recoder.xyz
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-neutral-900">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Need something the posture above doesn&apos;t cover?</h2>
          <p className="text-xl text-blue-100 mb-8">
            Tell us what your security review actually requires — SSO, a DPA, a specific control
            mapping. That list is how we prioritize what gets built next.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/contact">
              <Button size="lg" className="bg-white text-blue-600 hover:bg-gray-100">
                Contact us
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <a href={EVIDENCE_SAMPLE_URL}>
              <Button size="lg" className="bg-blue-500 hover:bg-blue-400 text-white">
                See a sample evidence record
              </Button>
            </a>
          </div>
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
