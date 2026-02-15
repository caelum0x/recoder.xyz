import Climate from "@repo/design-system/components/climate";
import { Container } from "@repo/design-system/components/container";
import { polar } from "@repo/payments";
import type { Metadata } from "next";
import { env } from "@/env";
import { PricingTable } from "./components/pricing-table";

const title = "Simple, transparent pricing";
const description =
  "No hidden fees. No surprises. 15-day trial. Cancel anytime.";

export const metadata: Metadata = {
  title,
  description,
};

const Pricing = async () => {
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
};

export default Pricing;
