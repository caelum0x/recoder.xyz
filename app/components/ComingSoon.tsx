import Link from 'next/link';
import { Clock, ArrowLeft } from 'lucide-react';

interface ComingSoonProps {
  title?: string;
  description?: string;
  backLink?: string;
  backText?: string;
}

export default function ComingSoon({
  title = "Coming Soon",
  description = "This feature will be available after the beta period. Recoder.xyz is currently 100% FREE with BYOK (Bring Your Own Key).",
  backLink = "/dashboard",
  backText = "Back to Dashboard"
}: ComingSoonProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex items-center justify-center p-4">
      <div className="max-w-2xl w-full text-center">
        {/* Beta Badge */}
        <div className="inline-flex items-center px-4 py-2 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-sm font-semibold mb-8">
          🎉 FREE BETA - No Payment Required
        </div>

        {/* Icon */}
        <div className="mb-8 flex justify-center">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-orange-500/20 to-purple-500/20 border border-orange-500/30 flex items-center justify-center">
            <Clock className="w-12 h-12 text-orange-400" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl md:text-5xl font-bold mb-4 bg-gradient-to-r from-orange-400 to-purple-400 text-transparent bg-clip-text">
          {title}
        </h1>

        {/* Description */}
        <p className="text-xl text-gray-400 mb-8 max-w-xl mx-auto">
          {description}
        </p>

        {/* Info Box */}
        <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6 mb-8 text-left max-w-lg mx-auto">
          <h3 className="text-lg font-semibold mb-3 text-white">What You Get in Beta (FREE):</h3>
          <ul className="space-y-2 text-gray-300">
            <li className="flex items-start">
              <span className="text-green-400 mr-2">✓</span>
              <span>Unlimited Spaces access</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-400 mr-2">✓</span>
              <span>Complete CLI tool integration</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-400 mr-2">✓</span>
              <span>40+ AI models (with your own API key)</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-400 mr-2">✓</span>
              <span>Spaces ↔ CLI synchronization</span>
            </li>
            <li className="flex items-start">
              <span className="text-green-400 mr-2">✓</span>
              <span>Unlimited projects</span>
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href={backLink}
            className="inline-flex items-center justify-center px-6 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            {backText}
          </Link>
          <Link
            href="/settings/ai-providers"
            className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-orange-500 to-purple-500 hover:from-orange-600 hover:to-purple-600 text-white rounded-lg font-semibold transition-all"
          >
            Manage API Keys
          </Link>
        </div>

        {/* Footer Note */}
        <p className="text-sm text-gray-500 mt-8">
          Paid tiers will be introduced after the beta period based on user feedback.
        </p>
      </div>
    </div>
  );
}
