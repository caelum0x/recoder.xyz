'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Terminal, CheckCircle, X } from 'lucide-react';

export default function CLICallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const searchParams = useSearchParams();

  useEffect(() => {
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    if (error) {
      setStatus('error');
      return;
    }

    if (code) {
      setStatus('success');
      setTimeout(() => window.close(), 3000);
    } else {
      setStatus('error');
    }
  }, [searchParams]);

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center">
      <div className="max-w-md w-full mx-auto p-8">
        <div className="text-center space-y-6">
          {/* Logo */}
          <div className="flex items-center justify-center space-x-2 mb-8">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Terminal className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-bold">recoder</span>
          </div>

          {status === 'loading' && (
            <>
              <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <h2 className="text-2xl font-bold">Processing Authentication</h2>
              <p className="text-gray-400">Completing CLI authentication...</p>
            </>
          )}
          
          {status === 'success' && (
            <>
              <div className="w-12 h-12 bg-green-500/10 border border-green-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <h2 className="text-2xl font-bold text-green-400">Authentication Successful!</h2>
              <p className="text-gray-400">You can now return to your CLI.</p>
              <p className="text-sm text-gray-500">This window will close automatically in 3 seconds.</p>
            </>
          )}
          
          {status === 'error' && (
            <>
              <div className="w-12 h-12 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
                <X className="w-6 h-6 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-red-400">Authentication Failed</h2>
              <p className="text-gray-400">There was an error during authentication.</p>
              <button 
                onClick={() => window.close()}
                className="mt-4 px-6 py-2 bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors"
              >
                Close Window
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
