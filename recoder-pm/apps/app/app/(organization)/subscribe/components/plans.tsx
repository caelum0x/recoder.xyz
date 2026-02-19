"use client";

import {
  MAX_FREE_CHANGELOGS,
  MAX_FREE_FEATURES,
  MAX_FREE_FEEDBACK,
  MAX_FREE_INITIATIVES,
  MAX_FREE_MEMBERS,
} from "@repo/lib/consts";
import pluralize from "pluralize";
import { useState } from "react";
import type { PlanName } from "@/lib/plans";
import { AnimatedTabs } from "./animated-tabs";
import type { PlanCardProperties } from "./plan-card";
import { PlanCard } from "./plan-card";

type PolarProduct = {
  id: string;
  name: string;
  description: string | null;
  prices: { id: string; amount: number | null; interval: string }[];
  features: string[];
};

type PlansProperties = {
  readonly products: PolarProduct[];
  readonly currentPlan: PlanName;
};

const getPlans = ({
  products,
  currentPlan,
}: PlansProperties): PlanCardProperties["plan"][] => {
  const plans: PlanCardProperties["plan"][] = [];

  for (const product of products) {
    const monthlyPrices = product.prices.filter((p) => p.interval === "month");
    const yearlyPrices = product.prices.filter((p) => p.interval === "year");

    plans.push({
      id: product.id,
      name: product.name,
      description: product.description,
      prices: [
        ...monthlyPrices.map((p) => ({
          interval: "MONTHLY" as const,
          id: p.id,
          value: p.amount ? p.amount / 100 : ("Free" as const),
        })),
        ...yearlyPrices.map((p) => ({
          interval: "YEARLY" as const,
          id: p.id,
          value: p.amount ? p.amount / 100 : ("Free" as const),
        })),
      ],
      cta:
        currentPlan === "PRO"
          ? null
          : `/api/polar/checkout?productId=${product.id}`,
      label: currentPlan === "PRO" ? "Current plan" : "Subscribe",
      features: product.features,
    });
  }

  plans.unshift({
    id: "hobby",
    name: "Hobby",
    description: "For individuals",
    prices: [
      {
        interval: "MONTHLY",
        id: "free",
        value: "Free",
      },
      {
        interval: "YEARLY",
        id: "free",
        value: "Free",
      },
    ],
    cta: currentPlan === "FREE" ? null : "/api/polar/portal",
    label: currentPlan === "FREE" ? "Current plan" : "Downgrade",
    features: [
      pluralize("user", MAX_FREE_MEMBERS, true),
      pluralize("feedback", MAX_FREE_FEEDBACK, true),
      pluralize("feature", MAX_FREE_FEATURES, true),
      pluralize("changelog", MAX_FREE_CHANGELOGS, true),
      pluralize("initiative", MAX_FREE_INITIATIVES, true),
      "All integrations",
    ],
  });

  plans.push({
    id: "enterprise",
    name: "Enterprise",
    description: "For large organizations",
    prices: [
      {
        interval: "MONTHLY",
        id: "custom",
        value: "Get in touch",
      },
      {
        interval: "YEARLY",
        id: "custom",
        value: "Get in touch",
      },
    ],
    cta: currentPlan === "ENTERPRISE" ? null : "mailto:hello@recoder.xyz",
    label: currentPlan === "ENTERPRISE" ? "Current plan" : "Get in touch",
    features: [
      "99.99% Uptime SLA",
      "Support SLA",
      "Guided onboarding",
      "Dedicated support",
      "SAML authentication",
      "Audit logs",
    ],
  });

  return plans;
};

export const Plans = ({ products, currentPlan }: PlansProperties) => {
  const [interval, setInterval] = useState<"MONTHLY" | "YEARLY">("YEARLY");
  const plans = getPlans({
    products,
    currentPlan,
  });

  return (
    <div className="not-prose flex flex-col items-center">
      <div className="relative">
        <AnimatedTabs
          onChange={(newInterval) =>
            setInterval(newInterval as "MONTHLY" | "YEARLY")
          }
          options={[
            { id: "MONTHLY", label: "Monthly" },
            { id: "YEARLY", label: "Yearly" },
          ]}
          value={interval}
        />
        {interval === "YEARLY" && (
          <p className="-right-20 -rotate-6 absolute top-2 font-medium text-sm text-violet-500">
            Save 20%!
          </p>
        )}
      </div>
      <div className="not-prose mt-8 grid w-full gap-2 sm:grid-cols-3">
        {plans.map((plan, index) => (
          <PlanCard
            interval={interval}
            key={plan.id}
            plan={plan}
            previousPlanName={index ? plans[index - 1].name : null}
          />
        ))}
      </div>
    </div>
  );
};
