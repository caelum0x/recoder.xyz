import Climate from "@repo/design-system/components/climate";
import { Container } from "@repo/design-system/components/container";
import { polar } from "@repo/payments";
import type { Metadata } from "next";
import { env } from "@/env";
import { PricingTable } from "./components/pricing-table";

const title = "Simple, transparent pricing";
const description =
  "No hidden fees. No surprises. 15-day trial. Cancel anytime.";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title,
  description,
};

const isPlaceholderValue = (value: string | undefined) =>
  !value || value.includes("placeholder") || value.includes("disabled");

const Pricing = async () => {
  try {
    if (isPlaceholderValue(env.POLAR_PRODUCT_PRO_ID)) {
      throw new Error("POLAR_PRODUCT_PRO_ID is not configured");
    }

    const product = await polar.products.get({
      id: env.POLAR_PRODUCT_PRO_ID,
    });

    const monthlyPrice = product.prices.find(
      (price) =>
        "recurringInterval" in price && price.recurringInterval === "month"
    );

    const annualPrice = product.prices.find(
      (price) =>
        "recurringInterval" in price && price.recurringInterval === "year"
    );

    const monthlyAmount =
      monthlyPrice &&
      "amountType" in monthlyPrice &&
      monthlyPrice.amountType === "fixed"
        ? monthlyPrice.priceAmount
        : null;

    const annualAmount =
      annualPrice &&
      "amountType" in annualPrice &&
      annualPrice.amountType === "fixed"
        ? annualPrice.priceAmount
        : null;

    if (!(monthlyAmount && annualAmount)) {
      throw new Error("No prices found");
    }

    return (
      <Container className="border-x p-4 pt-16 text-center">
        <header className="flex flex-col items-center gap-4">
          <h1 className="mb-0 pr-1 text-center font-semibold text-[2.125rem] tracking-tighter sm:text-5xl">
            {title}
          </h1>
          <p className="text-center text-lg text-muted-foreground">
            {description}
          </p>
        </header>
        <PricingTable
          annualPrice={annualAmount / 100 / 12}
          monthlyPrice={monthlyAmount / 100}
        />
        <div className="flex justify-center py-16">
          <Climate />
        </div>
      </Container>
    );
  } catch (_error) {
    return (
      <Container className="border-x p-4 pt-16 text-center">
        <header className="mx-auto flex max-w-2xl flex-col items-center gap-4">
          <h1 className="mb-0 pr-1 text-center font-semibold text-[2.125rem] tracking-tighter sm:text-5xl">
            {title}
          </h1>
          <p className="text-center text-lg text-muted-foreground">
            Pricing is being refreshed. Start with Recoder on the main app or
            contact us for current plan details.
          </p>
          <div className="flex flex-col items-center gap-3 sm:flex-row">
            <a
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground"
              href="https://recoder.xyz/auth/signup"
            >
              Get started
            </a>
            <a
              className="inline-flex h-10 items-center justify-center rounded-md border px-6 text-sm font-medium"
              href="https://x.com/haydenbleasel"
              rel="noreferrer"
              target="_blank"
            >
              Contact sales
            </a>
          </div>
        </header>
        <div className="flex justify-center py-16">
          <Climate />
        </div>
      </Container>
    );
  }
};

export default Pricing;
