"use client";

import { Container } from "@repo/design-system/components/container";
import { Link } from "@repo/design-system/components/link";
import { Button } from "@repo/design-system/components/ui/button";
import { useEffect } from "react";

type ErrorProperties = {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
};

const ErrorPage = ({ error, reset }: ErrorProperties) => {
  useEffect(() => {
    console.error("Application error:", error);
  }, [error]);

  return (
    <Container className="border-x p-16">
      <div className="mx-auto flex flex-col items-center justify-center text-center text-foreground">
        <h1 className="mt-0 mb-4 font-semibold text-3xl tracking-tighter sm:text-5xl">
          Something went wrong
        </h1>
        <p className="m-0 text-muted-foreground">
          An unexpected error occurred. Please try again.
        </p>
        <div className="mt-6 flex gap-3">
          <Button onClick={() => reset()} variant="outline">
            Try again
          </Button>
          <Button asChild variant="outline">
            <Link className="not-prose" href="/">
              Return Home
            </Link>
          </Button>
        </div>
      </div>
    </Container>
  );
};

export default ErrorPage;
