import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-5xl font-bold mb-6">Privacy Policy</h1>
        <p className="text-gray-400 mb-12">Last updated: December 2025</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">Overview</h2>
            <p className="text-gray-300">
              Recoder.xyz ("we", "our", "us") is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Information We Collect</h2>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li><strong>Account Information:</strong> Email, name, and profile picture from OAuth providers (Google, GitHub)</li>
              <li><strong>API Keys:</strong> Encrypted and stored securely. We never access or use your API keys for our purposes</li>
              <li><strong>Usage Data:</strong> Anonymous analytics to improve our service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">What We Don't Collect</h2>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Your source code (processed directly by AI providers)</li>
              <li>AI conversation history</li>
              <li>Payment information (handled by AI providers directly)</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">How We Use Your Information</h2>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Provide and maintain our services</li>
              <li>Authenticate your account</li>
              <li>Send important service updates</li>
              <li>Improve our platform</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Data Security</h2>
            <p className="text-gray-300">
              We use industry-standard encryption for all sensitive data. API keys are encrypted at rest using AES-256. All connections use HTTPS/TLS.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Third-Party Services</h2>
            <p className="text-gray-300">
              When you use AI features, your prompts are sent to your chosen AI provider (OpenAI, Anthropic, Google, etc.). Please review their privacy policies.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Your Rights</h2>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Access your personal data</li>
              <li>Delete your account and all associated data</li>
              <li>Export your data</li>
              <li>Opt out of non-essential communications</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">Contact</h2>
            <p className="text-gray-300">
              Questions about this policy? Contact us at privacy@recoder.xyz
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
