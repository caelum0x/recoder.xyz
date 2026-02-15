import { currentOrganizationId } from "@repo/backend/auth/utils";
import { authDatabase } from "@repo/backend/auth-database";
import { Button } from "@repo/design-system/components/ui/button";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CreateOrganizationForm } from "./components/form";

const title = "Create Organization";
const description = "Create an organization to get started.";

export const metadata: Metadata = createMetadata({ title, description });

const SetupPage = async () => {
  const organizationId = await currentOrganizationId();

  if (organizationId) {
    redirect("/");
  }

  const handleSignOut = async () => {
    "use server";

    const cookieStore = await cookies();
    const rawToken =
      cookieStore.get("recoder.session_token")?.value ??
      cookieStore.get("__Secure-recoder.session_token")?.value;
    const sessionToken = rawToken?.split(".")[0] ?? null;

    if (sessionToken) {
      await authDatabase.session.deleteMany({
        where: { token: sessionToken },
      });
    }

    const isProd = process.env.NODE_ENV === "production";
    const domain = isProd ? ".recoder.xyz" : undefined;

    cookieStore.set("recoder.session_token", "", {
      path: "/",
      maxAge: 0,
      ...(domain ? { domain } : {}),
    });
    cookieStore.set("__Secure-recoder.session_token", "", {
      path: "/",
      maxAge: 0,
      ...(domain ? { domain } : {}),
    });
    redirect("/sign-in");
  };

  return (
    <div className="grid min-h-screen w-screen items-center justify-center px-4 py-16">
      <div className="fixed top-4 right-4">
        <form action={handleSignOut}>
          <Button type="submit" variant="outline">
            Sign Out
          </Button>
        </form>
      </div>
      <div className="w-full max-w-[400px] space-y-8">
        <CreateOrganizationForm />
        <p className="text-center text-muted-foreground text-sm">
          Is your organization already using Recoder PM? Ask your organization
          owner to invite you to join.
        </p>
      </div>
    </div>
  );
};

export default SetupPage;
