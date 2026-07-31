import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Terms of Service - Recoder.xyz',
  description: 'Terms of Service for Recoder.xyz. Covers the BYOK model, beta status, user responsibilities, and intellectual property.',
  openGraph: {
    title: 'Terms of Service - Recoder.xyz',
    description: 'Terms of Service for Recoder.xyz. Covers the BYOK model, beta status, user responsibilities, and intellectual property.',
    url: 'https://recoder.xyz/legal/terms',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder Terms of Service' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Terms of Service - Recoder.xyz',
    description: 'Terms of Service for Recoder.xyz. Covers the BYOK model, beta status, and user responsibilities.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/legal/terms',
  },
};

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Main Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Terms of Service</h1>
            <p className="text-gray-400">Last updated: July 31, 2026</p>
          </div>

          <div className="prose prose-invert max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="text-gray-300 leading-relaxed">
                Welcome to Recoder.xyz ("Service", "Platform", "we", "us", or "our"). By accessing or using our Service,
                you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms,
                you may not access the Service.
              </p>
            </section>

            {/* Service Description */}
            <section>
              <h2 className="text-2xl font-bold mb-4">2. Description of the Service</h2>
              <p className="text-gray-300 leading-relaxed">
                Recoder is a self-hosted convergence workspace for AI coding agents, available as a
                desktop application and a companion web platform. It lets you run coding agents (such
                as Claude Code, Codex, and other agent CLIs) in parallel, isolated git worktrees using
                your own API keys (BYOK), compare their divergent changes, and merge one reviewed,
                evidence-backed result. Features and functionality may change over time, and the
                Service may occasionally experience downtime or interruptions.
              </p>
            </section>

            {/* BYOK Model */}
            <section>
              <h2 className="text-2xl font-bold mb-4">3. Bring Your Own Key (BYOK) Model</h2>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">3.1 API Key Requirements</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                To use AI features on Recoder.xyz, you must provide your own API key from supported providers
                (OpenRouter, Anthropic, OpenAI, or others). You are responsible for:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Obtaining and maintaining valid API keys from third-party providers</li>
                <li>All costs associated with API usage through your keys</li>
                <li>Ensuring your API keys remain secure and confidential</li>
                <li>Compliance with the terms of service of your chosen AI provider(s)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">3.2 No Liability for API Costs</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                <strong className="text-white">IMPORTANT:</strong> Recoder.xyz is NOT responsible for:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Costs incurred through your API key usage</li>
                <li>Unexpected charges from AI providers</li>
                <li>Rate limiting or service interruptions from third-party providers</li>
                <li>Quality, accuracy, or performance of third-party AI models</li>
                <li>Any actions taken by AI providers regarding your account or API keys</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">3.3 API Key Security</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                We implement industry-standard security measures (AES-256-GCM encryption) to protect your API keys.
                However, you acknowledge that:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>You are solely responsible for monitoring your API key usage and costs</li>
                <li>You should immediately regenerate your API key if you suspect unauthorized access</li>
                <li>We are not liable for any unauthorized use of your API keys</li>
                <li>You grant us permission to use your API keys solely to provide the Service</li>
              </ul>
            </section>

            {/* User Responsibilities */}
            <section>
              <h2 className="text-2xl font-bold mb-4">4. User Responsibilities</h2>
              <p className="text-gray-300 leading-relaxed mb-4">You agree to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Provide accurate and complete information when creating an account</li>
                <li>Maintain the security of your account credentials</li>
                <li>Not use the Service for any illegal or unauthorized purpose</li>
                <li>Not attempt to gain unauthorized access to any part of the Service</li>
                <li>Not interfere with or disrupt the Service or servers</li>
                <li>Comply with all applicable laws and regulations</li>
              </ul>
            </section>

            {/* Intellectual Property */}
            <section>
              <h2 className="text-2xl font-bold mb-4">5. Intellectual Property</h2>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">5.1 Your Content</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                You retain all rights to the code, projects, and content you create using the Service.
                By using the Service, you grant us a limited license to store, process, and display your
                content solely for the purpose of providing the Service.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">5.2 AI-Generated Content</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Content generated by AI models belongs to you, subject to the terms of the AI provider
                whose API you are using. We make no claims to ownership of AI-generated content.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">5.3 Platform Content</h3>
              <p className="text-gray-300 leading-relaxed">
                The Recoder.xyz platform, including its design, features, and source code, is protected by
                copyright and other intellectual property laws.
              </p>
            </section>

            {/* Disclaimers */}
            <section>
              <h2 className="text-2xl font-bold mb-4">6. Disclaimers and Limitations of Liability</h2>

              <div className="p-6 rounded-lg bg-orange-500/10 border border-orange-500/30 mb-4">
                <p className="text-gray-300 leading-relaxed">
                  <strong className="text-white">THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE"
                  WITHOUT WARRANTIES OF ANY KIND.</strong> We do not guarantee that the Service will be
                  uninterrupted, secure, or error-free.
                </p>
              </div>

              <p className="text-gray-300 leading-relaxed mb-4">
                To the maximum extent permitted by law, Recoder.xyz shall not be liable for:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>Any indirect, incidental, special, consequential, or punitive damages</li>
                <li>Loss of profits, revenue, data, or business opportunities</li>
                <li>Costs incurred from third-party AI API usage</li>
                <li>Actions or inactions of third-party AI providers</li>
                <li>Errors, inaccuracies, or omissions in AI-generated content</li>
                <li>Any damages arising from your use or inability to use the Service</li>
              </ul>
            </section>

            {/* Data and Privacy */}
            <section>
              <h2 className="text-2xl font-bold mb-4">7. Data and Privacy</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                Our collection and use of personal information is described in our{' '}
                <Link href="/legal/privacy" className="text-orange-500 hover:text-orange-400 underline">
                  Privacy Policy
                </Link>. By using the Service, you consent to our data practices as described in the Privacy Policy.
              </p>
            </section>

            {/* Termination */}
            <section>
              <h2 className="text-2xl font-bold mb-4">8. Termination</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We reserve the right to suspend or terminate your access to the Service at any time,
                with or without notice, for any reason, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Violation of these Terms</li>
                <li>Fraudulent, abusive, or illegal activity</li>
                <li>Extended period of inactivity</li>
                <li>Discontinuation of the Service</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                Upon termination, your right to use the Service will immediately cease. You may delete
                your account at any time through your account settings.
              </p>
            </section>

            {/* Changes to Terms */}
            <section>
              <h2 className="text-2xl font-bold mb-4">9. Changes to Terms</h2>
              <p className="text-gray-300 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of material
                changes via email or through the Service. Your continued use of the Service after changes
                constitutes acceptance of the modified Terms.
              </p>
            </section>

            {/* Subscriptions, Billing & Refunds */}
            <section>
              <h2 className="text-2xl font-bold mb-4">10. Subscriptions, Billing, and Refunds</h2>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">10.1 Plans</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Recoder offers a free tier (bring your own API key) alongside optional paid subscription
                plans that add hosted model access, higher usage limits, and additional features. The
                free BYOK tier remains available; you are never obligated to upgrade to a paid plan.
                Current plans and prices are shown on our{' '}
                <Link href="/pricing" className="text-orange-500 hover:text-orange-400 underline">pricing page</Link>.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">10.2 Merchant of Record (Creem)</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Paid subscriptions are sold and processed by our Merchant of Record,{' '}
                <a href="https://www.creem.io" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">Creem</a>.
                When you purchase a plan, Creem is the seller of record: it handles checkout, payment
                processing, and the collection and remittance of any applicable sales tax or VAT, and
                it issues your invoice. Your purchase is therefore also subject to{' '}
                <a href="https://www.creem.io/legal/terms" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">Creem&rsquo;s Terms</a>{' '}
                and{' '}
                <a href="https://www.creem.io/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">Privacy Policy</a>.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">10.3 Recurring Billing</h3>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Paid plans are billed in advance on a recurring basis (weekly or monthly, per the plan you choose) until cancelled.</li>
                <li>By subscribing, you authorize Creem to charge your payment method for each renewal at the then-current price.</li>
                <li>We will give reasonable advance notice of any change to your subscription price before it takes effect.</li>
                <li>Applicable taxes may be added at checkout based on your billing location.</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">10.4 Cancellation</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                You may cancel your subscription at any time from your account settings or via the
                billing portal linked in your receipt. Cancellation stops future renewals; your plan
                remains active until the end of the current paid period, after which your account
                reverts to the free tier. You are responsible for cancelling before a renewal date to
                avoid being charged for the next period.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">10.5 Refunds</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you are not satisfied, contact us at{' '}
                <a href="mailto:contact@recoder.xyz" className="text-orange-500 hover:text-orange-400 underline">contact@recoder.xyz</a>{' '}
                within <strong className="text-white">14 days</strong> of a charge and we will review
                your request for a refund of that most recent payment. Refunds for duplicate or clearly
                erroneous charges are always honored. Because payments are processed by Creem as
                Merchant of Record, approved refunds are issued through Creem to your original payment
                method. This policy does not limit any statutory refund or cancellation rights you may
                have under the consumer-protection laws of your jurisdiction.
              </p>
            </section>

            {/* Governing Law */}
            <section>
              <h2 className="text-2xl font-bold mb-4">11. Governing Law</h2>
              <p className="text-gray-300 leading-relaxed">
                These Terms shall be governed by and construed in accordance with the laws of the jurisdiction
                in which Recoder.xyz operates, without regard to its conflict of law provisions.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-bold mb-4">12. Contact Information</h2>
              <p className="text-gray-300 leading-relaxed">
                If you have any questions about these Terms, please contact us at:{' '}
                <a href="mailto:contact@recoder.xyz" className="text-orange-500 hover:text-orange-400 underline">contact@recoder.xyz
                </a>
              </p>
              <p className="text-gray-300 leading-relaxed mt-2">
                Or reach out on Twitter:{' '}
                <a
                  href="https://twitter.com/recoderxyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-500 hover:text-orange-400 underline"
                >
                  @recoderxyz
                </a>
              </p>
            </section>

            {/* Acceptance */}
            <section className="p-6 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-gray-300 leading-relaxed">
                <strong className="text-white">By creating an account or using Recoder.xyz,
                you acknowledge that you have read, understood, and agree to be bound by these Terms of Service.</strong>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
