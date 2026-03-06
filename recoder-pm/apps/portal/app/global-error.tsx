"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

type GlobalErrorProperties = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};

const GlobalError = ({ error, reset }: GlobalErrorProperties) => {
  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-background">
        <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-4">
          <div className="flex justify-center">
            <img src="/logo.png" alt="Recoder" className="h-12 w-12" />
          </div>
          <h1 className="text-4xl font-bold text-foreground">
            Something went wrong
          </h1>
          <p className="max-w-md text-center text-muted-foreground">
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p className="text-sm text-muted-foreground/70">
              Error ID: {error.digest}
            </p>
          )}
          <div className="flex gap-3">
            <Button onClick={() => reset()}>Try Again</Button>
            <Button asChild variant="outline">
              <a href="/">Return Home</a>
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
};

export default GlobalError;
