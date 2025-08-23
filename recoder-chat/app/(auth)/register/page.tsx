'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {  useEffect, useState } from 'react';

import { AuthForm } from '@/components/auth-form';
import { SubmitButton } from '@/components/submit-button';

import { register, type RegisterActionState } from '../actions';
import { toast } from '@/components/toast';
import { useSession } from 'next-auth/react';

export default function Page() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [isSuccessful, setIsSuccessful] = useState(false);

  const [isPending, setIsPending] = useState(false);

  const { update: updateSession } = useSession();

  const handleSubmit = async (formData: FormData) => {
    setEmail(formData.get('email') as string);
    setIsPending(true);
    
    try {
      const result = await register({ status: 'idle' }, formData);
      
      if (result.status === 'user_exists') {
        toast({ type: 'error', description: 'Account already exists!' });
      } else if (result.status === 'failed') {
        toast({ type: 'error', description: 'Failed to create account!' });
      } else if (result.status === 'invalid_data') {
        toast({
          type: 'error',
          description: 'Failed validating your submission!',
        });
      } else if (result.status === 'success') {
        toast({ type: 'success', description: 'Account created successfully!' });
        setIsSuccessful(true);
        updateSession();
        router.refresh();
      }
    } catch (error) {
      toast({
        type: 'error',
        description: 'An error occurred. Please try again.',
      });
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="flex h-dvh w-screen items-start pt-12 md:pt-0 md:items-center justify-center bg-background">
      <div className="w-full max-w-md overflow-hidden rounded-2xl gap-12 flex flex-col">
        <div className="flex flex-col items-center justify-center gap-2 px-4 text-center sm:px-16">
          <h3 className="text-xl font-semibold dark:text-zinc-50">Sign Up</h3>
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            Create an account with your email and password
          </p>
        </div>
        <AuthForm action={handleSubmit} defaultEmail={email}>
          <SubmitButton isSuccessful={isSuccessful} isPending={isPending}>Sign Up</SubmitButton>
          <p className="text-center text-sm text-gray-600 mt-4 dark:text-zinc-400">
            {'Already have an account? '}
            <Link
              href="/login"
              className="font-semibold text-gray-800 hover:underline dark:text-zinc-200"
            >
              Sign in
            </Link>
            {' instead.'}
          </p>
        </AuthForm>
      </div>
    </div>
  );
}
