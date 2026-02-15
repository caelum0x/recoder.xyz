import { RecoderPmRole } from "@repo/backend/auth";
import {
  currentMembers,
  currentOrganizationId,
  currentUser,
} from "@repo/backend/auth/utils";
import { Logo } from "@repo/design-system/components/logo";
import { Button } from "@repo/design-system/components/ui/button";
import { MAX_FREE_MEMBERS } from "@repo/lib/consts";
import { polar } from "@repo/payments";
import { createMetadata } from "@repo/seo/metadata";
import { ChevronsDownIcon, SparklesIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import pluralize from "pluralize";
import { removeUser } from "@/actions/users/remove";
import { env } from "@/env";

const title = "Time to upgrade";
const description =
  "Thanks for trying Recoder PM! You've reached the limit of users on the free plan.";

export const metadata: Metadata = createMetadata({
  title,
  description,
});

const Upgrade = async () => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    notFound();
  }

  const members = await currentMembers();

  if (members.length <= MAX_FREE_MEMBERS) {
    redirect("/");
  }

  const product = await polar.products.get({
    id: env.POLAR_PRODUCT_PRO_ID,
  });

  if (!product) {
    notFound();
  }

  const removeUsers = async () => {
    "use server";

    const currentUserData = await currentUser();

    if (!currentUserData) {
      throw new Error("User not found");
    }

    const allMembers = await currentMembers();
    const otherUsers = allMembers.filter(
      (member) => member.id !== currentUserData.id
    );

    for (const otherUser of otherUsers) {
      const response = await removeUser(otherUser.id);

      if ("error" in response) {
        throw new Error(response.error);
      }
    }

    redirect("/");
  };

  if (user.user_metadata.organization_role !== RecoderPmRole.Admin) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 py-16">
        <Logo />
        <h1 className="mt-4 max-w-md text-center font-semibold text-2xl text-foreground">
          {title}
        </h1>
        <p className="max-w-sm text-center text-muted-foreground">
          {description} To continue, please ask your organization admin to
          upgrade to a paid plan or remove some users.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 py-16">
      <Logo />
      <h1 className="mt-4 max-w-md text-center font-semibold text-2xl text-foreground">
        Time to upgrade
      </h1>
      <p className="max-w-sm text-center text-muted-foreground">
        {description} To continue, please upgrade to a paid plan or remove some
        users.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <Button asChild>
          <Link
            className="flex items-center gap-2"
            href={`/api/polar/checkout?productId=${product.id}`}
          >
            <SparklesIcon size={16} />
            <span>Subscribe</span>
          </Link>
        </Button>
        <form action={removeUsers}>
          <Button
            className="flex items-center gap-2"
            type="submit"
            variant="outline"
          >
            <ChevronsDownIcon size={16} />
            Remove users
          </Button>
        </form>
      </div>
      <small className="max-w-[16rem] text-center text-muted-foreground">
        You currently have {pluralize("user", members.length, true)}. You can
        only have {pluralize("user", MAX_FREE_MEMBERS, true)} on the free plan.
      </small>
    </div>
  );
};

export default Upgrade;
