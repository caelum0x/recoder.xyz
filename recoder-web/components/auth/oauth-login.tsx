'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icons } from '@/components/icons';
import { cn } from '@/lib/utils';

interface OAuthLoginProps {
  className?: string;
  onSuccess?: (user: any) => void;
  onError?: (error: string) => void;
}

export function OAuthLogin({ className, onSuccess, onError }: OAuthLoginProps) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleOAuthLogin = async (provider: 'google' | 'github') => {
    try {
      setLoading(provider);
      
      // Redirect to backend OAuth endpoint
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      window.location.href = `${backendUrl}/api/oauth/${provider}`;
      
    } catch (error) {
      console.error(`${provider} OAuth error:`, error);
      onError?.(error instanceof Error ? error.message : 'Authentication failed');
      setLoading(null);
    }
  };

  return (
    <div className={cn('grid gap-3', className)}>
      <Button
        variant="outline"
        onClick={() => handleOAuthLogin('google')}
        disabled={loading !== null}
      >
        {loading === 'google' ? (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.google className="mr-2 h-4 w-4" />
        )}
        Continue with Google
      </Button>
      
      <Button
        variant="outline"
        onClick={() => handleOAuthLogin('github')}
        disabled={loading !== null}
      >
        {loading === 'github' ? (
          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Icons.gitHub className="mr-2 h-4 w-4" />
        )}
        Continue with GitHub
      </Button>
    </div>
  );
}