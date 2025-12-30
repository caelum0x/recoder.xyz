export default function TermsPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-4xl mx-auto px-4 py-20">
        <h1 className="text-5xl font-bold mb-6">Terms of Service</h1>
        <p className="text-gray-400 mb-12">Last updated: December 2025</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p className="text-gray-300">
              By accessing or using Recoder.xyz, you agree to be bound by these Terms of Service. If you disagree with any part, you may not access the service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Description of Service</h2>
            <p className="text-gray-300">
              Recoder.xyz provides AI-powered development tools including a Web IDE and CLI. The service requires users to provide their own API keys for AI providers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. User Responsibilities</h2>
            <ul className="list-disc pl-6 text-gray-300 space-y-2">
              <li>Maintain the security of your account credentials</li>
              <li>Use the service in compliance with applicable laws</li>
              <li>Not use the service to generate malicious code</li>
              <li>Not attempt to circumvent security measures</li>
              <li>Comply with AI provider terms of service</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. API Keys and Billing</h2>
            <p className="text-gray-300">
              You are responsible for all charges incurred through your API keys. Recoder.xyz does not charge for the platform during beta. AI provider costs are billed directly by those providers.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Intellectual Property</h2>
            <p className="text-gray-300">
              Code you generate using Recoder.xyz belongs to you. You retain all rights to your projects and outputs. The Recoder.xyz platform, branding, and original code remain our property.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Disclaimer of Warranties</h2>
            <p className="text-gray-300">
              The service is provided "as is" without warranties of any kind. We do not guarantee that AI-generated code will be error-free, secure, or fit for any particular purpose.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Limitation of Liability</h2>
            <p className="text-gray-300">
              Recoder.xyz shall not be liable for any indirect, incidental, special, or consequential damages resulting from your use of the service.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Termination</h2>
            <p className="text-gray-300">
              We may terminate or suspend your account at any time for violations of these terms. You may delete your account at any time through the settings page.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. Changes to Terms</h2>
            <p className="text-gray-300">
              We reserve the right to modify these terms at any time. Continued use of the service after changes constitutes acceptance of the new terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">10. Contact</h2>
            <p className="text-gray-300">
              Questions about these terms? Contact us at legal@recoder.xyz
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
