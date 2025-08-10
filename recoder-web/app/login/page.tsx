// Force dynamic rendering to avoid SSR issues
export const dynamic = 'force-dynamic';
import LoginForm from '@/components/auth/login-form';

export default function LoginPage() {
  return <LoginForm />;
}