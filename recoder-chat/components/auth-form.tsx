import Form from 'next/form';

import { Input } from './ui/input';
import { Label } from './ui/label';

export function AuthForm({
  action,
  children,
  defaultEmail = '',
}: {
  action: NonNullable<
    string | ((formData: FormData) => void | Promise<void>) | undefined
  >;
  children: React.ReactNode;
  defaultEmail?: string;
}) {
  return (
    <div className="auth-form-container p-6 max-w-md mx-auto">
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Recoder Chat
        </h1>
        <p className="text-sm text-muted-foreground mt-2">
          AI-powered development assistant
        </p>
      </div>
      
      <Form action={action} className="flex flex-col gap-4 px-2">
        <div className="flex flex-col gap-2">
          <Label
            htmlFor="email"
            className="text-foreground font-medium"
          >
            Email Address
          </Label>

          <Input
            id="email"
            name="email"
            className="bg-background border-border text-md md:text-sm h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            type="email"
            placeholder="developer@example.com"
            autoComplete="email"
            required
            autoFocus
            defaultValue={defaultEmail}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label
            htmlFor="password"
            className="text-foreground font-medium"
          >
            Password
          </Label>

          <Input
            id="password"
            name="password"
            className="bg-background border-border text-md md:text-sm h-11 transition-all duration-200 focus:ring-2 focus:ring-primary/20"
            type="password"
            placeholder="••••••••"
            required
          />
        </div>

        {children}
      </Form>
    </div>
  );
}
