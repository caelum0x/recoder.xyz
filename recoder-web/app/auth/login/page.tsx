import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import LoginClient from './login-client';

export default async function AuthPage() {
  const session = await auth();
  
  if (session) {
    redirect('/projects');
  }

  return <LoginClient />;
}
