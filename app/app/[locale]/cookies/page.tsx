import Link from 'next/link';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-black text-white">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-20">
        <h1 className="mb-6 text-5xl font-bold">Cookie Policy</h1>
        <p className="mb-12 text-gray-400">Last updated: March 2026</p>

        <div className="prose prose-invert max-w-none space-y-8">
          <section>
            <h2 className="mb-4 text-2xl font-bold">How Recoder uses cookies</h2>
            <p className="text-gray-300">
              We use cookies to keep you signed in across `recoder.xyz` services, remember basic preferences,
              and protect the platform against abuse.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold">Essential cookies</h2>
            <ul className="list-disc space-y-2 pl-6 text-gray-300">
              <li>Authentication cookies that let you sign in on `recoder.xyz` and access `web.recoder.xyz`.</li>
              <li>Security cookies used for session verification, CSRF protection, and abuse prevention.</li>
              <li>Locale and onboarding cookies that remember your language and basic setup state.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold">Analytics cookies</h2>
            <p className="text-gray-300">
              We may use analytics cookies to understand aggregate usage patterns and improve the product.
              Blocking those cookies should not prevent core sign-in or editor functionality.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold">Managing cookies</h2>
            <p className="text-gray-300">
              You can clear or block cookies in your browser settings. If you block essential cookies, sign-in
              and cross-service session sharing may stop working.
            </p>
          </section>

          <section>
            <h2 className="mb-4 text-2xl font-bold">Related policies</h2>
            <p className="text-gray-300">
              For more detail on how we handle your data, see our{' '}
              <Link href="/privacy" className="text-orange-500 hover:text-orange-400 underline">
                Privacy Policy
              </Link>{' '}
              and{' '}
              <Link href="/terms" className="text-orange-500 hover:text-orange-400 underline">
                Terms of Service
              </Link>.
            </p>
          </section>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
