import type { Metadata } from "next";
import { ContactEmailAction } from "@/components/contact-email-action";
import { LegalPage, type LegalSection } from "../legal/legal-page";

const UPDATED = "2026-08-27";

export const metadata: Metadata = {
  title: "Contact — Recoder",
  description:
    "How to reach Recoder for support, billing, sales, and account questions.",
  alternates: { canonical: "https://recoder.xyz/contact" },
};

const INTRO =
  "We are happy to help with support, billing, sales, and account questions. Use the email action below and we aim to respond within 2 business days.";

const SECTIONS: LegalSection[] = [
  {
    heading: "Support & general enquiries",
    body: ["Use the email action below for product support, account help, or general questions."],
  },
  {
    heading: "Billing & refunds",
    body: [
      "For billing questions, cancellations, or refund requests, contact us from the address associated with your account. See our Refund & Cancellation Policy for details and timelines.",
    ],
  },
  {
    heading: "Sales & partnerships",
    body: ["For enterprise, agency, or partnership enquiries, use the email action below and we will route you to the right person."],
  },
  {
    heading: "Follow us",
    body: ["Product and founder updates: x.com/recoderxyz."],
  },
];

export default function ContactPage() {
  return (
    <LegalPage title="Contact" updated={UPDATED} intro={INTRO} sections={SECTIONS}>
      <ContactEmailAction subject="Recoder enquiry" />
    </LegalPage>
  );
}
