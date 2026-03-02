import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'Privacy Policy - Recoder.xyz',
  description: 'Learn how Recoder.xyz collects, uses, and protects your data. AES-256-GCM encryption for API keys, GDPR-aware practices, and full transparency.',
  openGraph: {
    title: 'Privacy Policy - Recoder.xyz',
    description: 'Learn how Recoder.xyz collects, uses, and protects your data.',
    url: 'https://recoder.xyz/legal/privacy',
    siteName: 'Recoder.xyz',
    images: [{ url: 'https://recoder.xyz/og-image.png', width: 1200, height: 630, alt: 'Recoder Privacy Policy' }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Privacy Policy - Recoder.xyz',
    description: 'Learn how Recoder.xyz collects, uses, and protects your data.',
    images: ['https://recoder.xyz/og-image.png'],
  },
  alternates: {
    canonical: 'https://recoder.xyz/legal/privacy',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />

      {/* Main Content */}
      <div className="pt-24 pb-20 px-6">
        <div className="container mx-auto max-w-4xl">
          <div className="mb-12">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Privacy Policy</h1>
            <p className="text-gray-400">Last updated: November 19, 2024</p>
          </div>

          <div className="prose prose-invert max-w-none space-y-8">
            {/* Introduction */}
            <section>
              <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
              <p className="text-gray-300 leading-relaxed">
                Recoder.xyz ("we", "us", or "our") is committed to protecting your privacy.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information
                when you use our Service.
              </p>
            </section>

            {/* Information We Collect */}
            <section>
              <h2 className="text-2xl font-bold mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">2.1 Account Information</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                When you create an account, we collect:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Email address</li>
                <li>Username</li>
                <li>Password (hashed and salted)</li>
                <li>OAuth provider data (if using GitHub or Google sign-in)</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">2.2 API Keys (BYOK Model)</h3>
              <div className="p-6 rounded-lg bg-green-500/10 border border-green-500/30 mb-4">
                <p className="text-gray-300 leading-relaxed">
                  <strong className="text-white">Security First:</strong> Your API keys from third-party providers
                  (OpenRouter, Anthropic, OpenAI) are encrypted using <strong className="text-green-400">AES-256-GCM
                  encryption</strong> before being stored in our database. This is military-grade encryption—the same
                  level used by banks and government institutions.
                </p>
              </div>
              <p className="text-gray-300 leading-relaxed mb-4">
                When you add an API key, we store:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li><strong className="text-white">Encrypted API key:</strong> Your full API key is encrypted and can only be decrypted when making API calls on your behalf</li>
                <li><strong className="text-white">Key prefix:</strong> First 8-10 characters for display purposes (e.g., "sk-or-v1-***")</li>
                <li><strong className="text-white">Provider name:</strong> Which service the key is for (OpenRouter, Anthropic, etc.)</li>
                <li><strong className="text-white">Optional name:</strong> User-friendly name you assign to the key</li>
                <li><strong className="text-white">Usage metadata:</strong> Last used timestamp, creation date</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">2.3 Project Data</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                We store your projects and code, including:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Project files and code</li>
                <li>Project metadata (title, description, file count)</li>
                <li>Chat history with AI (prompts and responses)</li>
                <li>Last modified timestamps</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">2.4 Usage Information</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                We automatically collect:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li>IP address and browser information</li>
                <li>Usage patterns and feature interactions</li>
                <li>Error logs and diagnostic information</li>
                <li>Session duration and frequency of use</li>
              </ul>
            </section>

            {/* How We Use Your Information */}
            <section>
              <h2 className="text-2xl font-bold mb-4">3. How We Use Your Information</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We use the collected information to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300">
                <li><strong className="text-white">Provide the Service:</strong> Process AI requests using your API keys, store your projects, and enable web↔CLI synchronization</li>
                <li><strong className="text-white">Improve the Service:</strong> Analyze usage patterns to enhance features and user experience</li>
                <li><strong className="text-white">Communicate:</strong> Send service updates, security alerts, and feature announcements</li>
                <li><strong className="text-white">Security:</strong> Detect and prevent fraud, abuse, or security incidents</li>
                <li><strong className="text-white">Support:</strong> Respond to your questions and provide customer support</li>
              </ul>
            </section>

            {/* API Key Security */}
            <section>
              <h2 className="text-2xl font-bold mb-4">4. API Key Security and Usage</h2>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">4.1 Encryption</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                Your API keys are protected with:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li><strong className="text-white">AES-256-GCM encryption:</strong> Industry-standard encryption algorithm</li>
                <li><strong className="text-white">Unique encryption keys:</strong> Master encryption key stored separately from database</li>
                <li><strong className="text-white">Encrypted at rest:</strong> Keys are never stored in plain text</li>
                <li><strong className="text-white">Encrypted in transit:</strong> All communication uses HTTPS/TLS</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">4.2 Access Control</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                API keys are only accessed when:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>You initiate an AI request through the web IDE or CLI</li>
                <li>The system needs to make API calls to third-party providers on your behalf</li>
                <li>You explicitly request to view or delete your keys</li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">4.3 We DO NOT</h3>
              <div className="p-6 rounded-lg bg-red-500/10 border border-red-500/30 mb-4">
                <ul className="list-disc list-inside space-y-2 text-gray-300">
                  <li>Share your API keys with any third parties</li>
                  <li>Use your API keys for our own purposes</li>
                  <li>Log or store your AI conversations with third-party providers</li>
                  <li>Analyze the content of your AI interactions</li>
                  <li>Have access to your decrypted API keys outside of active API calls</li>
                </ul>
              </div>
            </section>

            {/* Data Sharing */}
            <section>
              <h2 className="text-2xl font-bold mb-4">5. How We Share Your Information</h2>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">5.1 Third-Party AI Providers</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                When you use AI features, your prompts and requests are sent to the AI provider whose API key you configured
                (OpenRouter, Anthropic, OpenAI, etc.). These providers have their own privacy policies:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li><a href="https://openrouter.ai/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">OpenRouter Privacy Policy</a></li>
                <li><a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">Anthropic Privacy Policy</a></li>
                <li><a href="https://openai.com/policies/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:text-orange-400 underline">OpenAI Privacy Policy</a></li>
              </ul>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">5.2 Service Providers</h3>
              <p className="text-gray-300 leading-relaxed mb-4">
                We may share information with trusted service providers who help us operate the Service:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li><strong className="text-white">Database hosting:</strong> Neon (PostgreSQL database)</li>
                <li><strong className="text-white">Authentication:</strong> OAuth providers (GitHub, Google)</li>
                <li><strong className="text-white">Analytics:</strong> Usage analytics for improving the Service</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                These providers are contractually obligated to protect your data and only use it to provide services to us.
              </p>

              <h3 className="text-xl font-semibold mb-3 text-orange-500">5.3 Legal Requirements</h3>
              <p className="text-gray-300 leading-relaxed">
                We may disclose your information if required by law, court order, or government request, or to protect
                our rights, property, or safety.
              </p>
            </section>

            {/* Data Retention */}
            <section>
              <h2 className="text-2xl font-bold mb-4">6. Data Retention</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We retain your information for as long as:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Your account is active</li>
                <li>Needed to provide the Service</li>
                <li>Required by law or for legitimate business purposes</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                When you delete your account, we will delete your personal information within 30 days, except where
                retention is required by law.
              </p>
            </section>

            {/* Your Rights */}
            <section>
              <h2 className="text-2xl font-bold mb-4">7. Your Rights</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                You have the right to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li><strong className="text-white">Access:</strong> Request a copy of your personal data</li>
                <li><strong className="text-white">Correction:</strong> Update or correct inaccurate information</li>
                <li><strong className="text-white">Deletion:</strong> Request deletion of your account and data</li>
                <li><strong className="text-white">Export:</strong> Download your projects and data</li>
                <li><strong className="text-white">Opt-out:</strong> Unsubscribe from marketing communications</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                To exercise these rights, contact us at{' '}
                <a href="mailto:recoderxyz@gmail.com" className="text-orange-500 hover:text-orange-400 underline">
                  recoderxyz@gmail.com
                </a>
              </p>
            </section>

            {/* Security Measures */}
            <section>
              <h2 className="text-2xl font-bold mb-4">8. Security Measures</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We implement security measures to protect your information:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li><strong className="text-white">Encryption:</strong> AES-256-GCM for API keys, TLS/HTTPS for all communications</li>
                <li><strong className="text-white">Authentication:</strong> Secure password hashing (bcrypt), OAuth 2.0</li>
                <li><strong className="text-white">Access control:</strong> Role-based permissions and authentication</li>
                <li><strong className="text-white">Monitoring:</strong> Regular security audits and monitoring for threats</li>
                <li><strong className="text-white">Infrastructure:</strong> Hosted on secure, enterprise-grade cloud platforms</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                However, no method of transmission over the internet is 100% secure. While we strive to protect your data,
                we cannot guarantee absolute security.
              </p>
            </section>

            {/* Cookies */}
            <section>
              <h2 className="text-2xl font-bold mb-4">9. Cookies and Tracking</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                We use cookies and similar technologies to:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-300 mb-4">
                <li>Maintain your login session</li>
                <li>Remember your preferences</li>
                <li>Analyze usage patterns</li>
                <li>Improve Service performance</li>
              </ul>
              <p className="text-gray-300 leading-relaxed">
                You can control cookies through your browser settings, but disabling cookies may limit Service functionality.
              </p>
            </section>

            {/* Children's Privacy */}
            <section>
              <h2 className="text-2xl font-bold mb-4">10. Children's Privacy</h2>
              <p className="text-gray-300 leading-relaxed">
                Recoder.xyz is not intended for users under 13 years of age. We do not knowingly collect information from
                children under 13. If you believe we have collected information from a child under 13, please contact us
                immediately.
              </p>
            </section>

            {/* International Users */}
            <section>
              <h2 className="text-2xl font-bold mb-4">11. International Users</h2>
              <p className="text-gray-300 leading-relaxed">
                Your information may be transferred to and processed in countries other than your own. By using the Service,
                you consent to the transfer of your information to countries that may have different data protection laws
                than your jurisdiction.
              </p>
            </section>

            {/* Changes to Privacy Policy */}
            <section>
              <h2 className="text-2xl font-bold mb-4">12. Changes to This Privacy Policy</h2>
              <p className="text-gray-300 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of material changes via email or
                through the Service. Your continued use of the Service after changes constitutes acceptance of the updated
                Privacy Policy.
              </p>
            </section>

            {/* Contact */}
            <section>
              <h2 className="text-2xl font-bold mb-4">13. Contact Us</h2>
              <p className="text-gray-300 leading-relaxed mb-4">
                If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
              </p>
              <ul className="list-none space-y-2 text-gray-300">
                <li><strong className="text-white">Email:</strong>{' '}
                  <a href="mailto:recoderxyz@gmail.com" className="text-orange-500 hover:text-orange-400 underline">
                    recoderxyz@gmail.com
                  </a>
                </li>
                <li><strong className="text-white">Twitter:</strong>{' '}
                  <a
                    href="https://twitter.com/recoderxyz"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-orange-500 hover:text-orange-400 underline"
                  >
                    @recoderxyz
                  </a>
                </li>
              </ul>
            </section>

            {/* Acceptance */}
            <section className="p-6 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-gray-300 leading-relaxed">
                <strong className="text-white">By creating an account or using Recoder.xyz,
                you acknowledge that you have read and understood this Privacy Policy and agree to its terms.</strong>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
