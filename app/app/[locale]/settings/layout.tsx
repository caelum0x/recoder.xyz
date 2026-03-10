'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useSession } from '@/lib/session-provider';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, isPending } = useSession();

  useEffect(() => {
    if (!isPending && !session?.user) {
      const query = searchParams.toString();
      const pathWithQuery = `${pathname || '/settings'}${query ? `?${query}` : ''}`;
      const redirect = encodeURIComponent(pathWithQuery);
      router.replace(`/auth/signin?redirect=${redirect}`);
    }
  }, [isPending, pathname, router, searchParams, session?.user]);

  if (isPending || !session?.user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return <>{children}</>;
}
