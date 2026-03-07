"use client";

import { Link } from "@repo/design-system/components/link";
import { Button } from "@repo/design-system/components/ui/button";
import { parseError } from "@repo/lib/parse-error";
import { BugIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "@/components/empty-state";

type ErrorProperties = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};

const ErrorPage = ({ error, reset }: ErrorProperties) => {
  const [message, setMessage] = useState<string>("");
  const isDevelopment = process.env.NODE_ENV === "development";

  useEffect(() => {
    const newMessage = parseError(error);

    setMessage(newMessage);
  }, [error]);

  return (
    <main className="grid h-screen w-screen sm:grid-cols-2">
      <div className="flex items-center justify-center">
        <EmptyState
          description="This is on our end. We're looking into it and will get it fixed as soon as possible."
          icon={BugIcon}
          title="Oops, something went wrong"
        >
          <div className="mt-4 flex items-center gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <Button asChild variant="link">
              <Link href="/app">Return to App</Link>
            </Button>
          </div>
        </EmptyState>
      </div>
      {isDevelopment ? (
        <div className="h-full w-full max-w-none">
          <pre className="h-full w-full rounded-none border-none">{message}</pre>
        </div>
      ) : (
        <div className="hidden sm:flex h-full w-full items-center justify-center border-l border-border/40">
          <p className="max-w-sm text-sm text-muted-foreground px-8 text-center">
            Technical error details are hidden in production. Check server logs for full diagnostics.
          </p>
        </div>
      )}
    </main>
  );
};

export default ErrorPage;
