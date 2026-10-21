import { Suspense } from 'react';
import { UpgradePlans } from '@/components/billing/UpgradePlans';

// UpgradePlans now reads `?plan=` (the pricing->signup funnel continuation —
// see app/[locale]/auth/signup/page.tsx), which calls useSearchParams and so
// must sit inside a Suspense boundary (Next.js requirement for any
// useSearchParams consumer in a static-eligible route).
export default function UpgradePage() {
  return (
    <Suspense fallback={null}>
      <UpgradePlans />
    </Suspense>
  );
}
