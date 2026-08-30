import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../legal/legal-page";

const UPDATED = "2026-08-27";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy — Recoder",
  description:
    "How subscriptions, cancellations, and refunds work for Recoder, including how to request a refund and expected timelines.",
  alternates: { canonical: "https://recoder.xyz/refund" },
};

const INTRO =
  "This Refund & Cancellation Policy explains how billing, cancellations, and refunds work for Recoder subscriptions. Payments are processed by our merchant of record, which appears on your card statement and issues any approved refunds to your original payment method.";

const SECTIONS: LegalSection[] = [
  {
    heading: "Subscriptions and billing",
    body: [
      "Recoder is offered on recurring subscription plans billed in advance (monthly or annually) as shown on our Pricing page. Your subscription renews automatically at the end of each billing period unless you cancel before the renewal date.",
      "Applicable taxes are added at checkout where required and are handled by our merchant of record.",
    ],
  },
  {
    heading: "Cancelling your subscription",
    body: [
      "You can cancel at any time from your account billing settings, or by emailing founders@recoder.xyz. When you cancel, your plan stays active until the end of the current billing period and is not renewed afterward.",
      "Cancelling stops future charges. It does not, on its own, generate a refund for the current period except as described below.",
    ],
  },
  {
    heading: "14-day money-back guarantee",
    body: [
      "If you are not satisfied with a new paid subscription, you may request a full refund within 14 days of the initial charge. This applies to the first purchase of a plan, not to renewals.",
    ],
  },
  {
    heading: "Renewals",
    body: [
      "Renewal charges are generally non-refundable. If a renewal charged unexpectedly, contact us within 7 days of the charge and we will review it in good faith. We may issue a full or pro-rated refund at our discretion, for example where the service was unused after renewal.",
    ],
  },
  {
    heading: "Service issues",
    body: [
      "If a billing error, duplicate charge, or a material service failure attributable to Recoder prevented you from using the Service, contact us and we will correct the charge, including issuing a refund where appropriate.",
    ],
  },
  {
    heading: "How to request a refund",
    body: [
      "Email founders@recoder.xyz from the address associated with your account, including the charge date and amount. We aim to acknowledge refund requests within 2 business days.",
      "Approved refunds are issued to your original payment method by our merchant of record. Depending on your bank or card provider, it can take 5–10 business days for the refund to appear.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "Questions about billing, cancellations, or refunds: founders@recoder.xyz. See our Contact page for more ways to reach us.",
    ],
  },
];

export default function RefundPage() {
  return <LegalPage title="Refund & Cancellation Policy" updated={UPDATED} intro={INTRO} sections={SECTIONS} />;
}
