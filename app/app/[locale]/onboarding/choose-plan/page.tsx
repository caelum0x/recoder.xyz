import { redirect } from 'next/navigation';

export default function ChoosePlanRedirectPage() {
  redirect('/onboarding/setup-api-key');
}
