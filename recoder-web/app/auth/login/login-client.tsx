'use client';

import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Code2, Github, Chrome } from 'lucide-react';

export default function LoginClient() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 bg-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Code2 className="w-8 h-8 text-white" />
          </div>
          <CardTitle>Sign in to Recoder Web</CardTitle>
          <CardDescription>
            Build, code, and deploy projects with AI assistance
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={() => signIn('google', { callbackUrl: '/projects' })}
            variant="outline"
            className="w-full gap-2"
          >
            <Chrome className="w-4 h-4" />
            Continue with Google
          </Button>
          
          <Button
            onClick={() => signIn('github', { callbackUrl: '/projects' })}
            variant="outline"
            className="w-full gap-2"
          >
            <Github className="w-4 h-4" />
            Continue with GitHub
          </Button>
          
          <p className="text-xs text-gray-600 text-center">
            By signing in, you agree to our Terms of Service and Privacy Policy
          </p>
        </CardContent>
      </Card>
    </div>
  );
}