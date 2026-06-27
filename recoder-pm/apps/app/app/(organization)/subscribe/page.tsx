import { RecoderPmRole } from "@repo/backend/auth";
import {
  currentMembers,
  currentOrganizationId,
  currentUser,
} from "@repo/backend/auth/utils";
import Climate from "@repo/design-system/components/climate";
import { polar } from "@repo/payments";
import { createMetadata } from "@repo/seo/metadata";
import { CircleArrowUpIcon } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import pluralize from "pluralize";
import { database } from "@/lib/database";
import { currentPlan } from "@/lib/plans";
import { Plans } from "./components/plans";

export const metadata: Metadata = createMetadata({
  title: "Subscribe",
  description:
    "Choose a plan that works for you. All plans include a 14-day free trial.",
});

export const dynamic = "force-dynamic";
const Subscribe = async () => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (
    !(user && organizationId) ||
    user.user_metadata.organization_role !== RecoderPmRole.Admin
  ) {
    notFound();
  }

  const [plan, databaseOrganization, members] = await Promise.all([
    currentPlan(),
    database.organization.findFirst({
      where: { id: organizationId },
    }),
    currentMembers(),
  ]);

  if (!databaseOrganization) {
    notFound();
  }

  const products: {
    id: string;
    name: string;
    description: string | null;
    prices: { id: string; amount: number | null; interval: string }[];
    features: string[];
  }[] = [];

  const pages = await polar.products.list({ isArchived: false });
  for await (const page of pages) {
    for (const product of page.result.items) {
      const prices = product.prices.map((price: Record<string, unknown>) => ({
        id: price.id as string,
        amount:
          "amountType" in price && price.amountType === "fixed"
            ? (price.priceAmount as number)
            : null,
        interval:
          "recurringInterval" in price
            ? (price.recurringInterval as string)
            : "one_time",
      }));

      products.push({
        id: product.id,
        name: product.name,
        description: product.description,
        prices,
        features: product.benefits.map(
          (b: { description: string }) => b.description
        ),
      });
    }
  }

  if (products.length === 0) {
    notFound();
  }

  return (
    <div className="w-full px-6 py-16">
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <div className="flex flex-col items-center text-center">
          <CircleArrowUpIcon className="text-primary" size={48} />
          <div className="grid gap-2">
            <h1 className="mt-4 mb-2 font-semibold text-3xl tracking-tight">
              Upgrade your team
            </h1>
            <p>
              Choose a plan that works for you. All plans include a{" "}
              <span className="font-semibold text-primary">
                15-day free trial
              </span>
              .
            </p>
          </div>
        </div>
        <Plans currentPlan={plan} products={products} />
        <p className="text-center text-muted-foreground text-sm">
          You currently have {pluralize("user", members.length, true)} in your
          organization.
        </p>
        <div className="flex items-center justify-center">
          <Climate />
        </div>
      </div>
    </div>
  );
};

export default Subscribe;
