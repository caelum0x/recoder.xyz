import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../legal/legal-page";

const UPDATED = "2026-06-28";

export const metadata: Metadata = {
  title: "Privacy Policy — Recoder",
  description:
    "How Recoder handles your data. Recoder coordinates the coding agents you already run with your own keys; we keep our footprint small and explicit.",
  alternates: { canonical: "https://recoder.xyz/privacy" },
};

const INTRO =
  "Recoder (“Recoder”, “we”, “us”) builds a control plane that coordinates the coding agents you already run. This policy explains what we collect, why, and the choices you have. We aim to collect as little as possible and to be explicit about the rest.";

const SECTIONS: LegalSection[] = [
  {
    heading: "Summary",
    body: [
      "You bring your own agents and your own model provider keys. Recoder coordinates those agents; it does not resell inference and does not require you to hand us your provider credentials to use the local cockpit.",
    ],
    bullets: [
      "We do not sell your personal data.",
      "Your source code and agent keys stay under your control on your own machines unless you explicitly use a hosted or team feature that requires otherwise.",
      "Analytics, when enabled, are aggregate and privacy-respecting, with no cross-site advertising profiles.",
    ],
  },
  {
    heading: "Information we collect",
    body: [
      "We collect information in three ways: information you give us directly, information collected automatically when you use our website, and information from your use of optional hosted features.",
    ],
    bullets: [
      "Contact details you submit — such as your email and message when you request access, contact sales, or sign up for download notifications.",
      "Basic, privacy-respecting website analytics — aggregate page views and referrers, collected only when analytics are enabled and without third-party advertising cookies.",
      "Operational data for optional hosted or team features you choose to enable — for example coordination metadata needed to synchronize agents across machines.",
    ],
  },
  {
    heading: "How we use information",
    body: [
      "We use the information we collect to operate, maintain, and improve Recoder, to respond to your requests, and to keep the service secure.",
    ],
    bullets: [
      "Provide and operate the website and the features you request.",
      "Respond to sales, support, and access inquiries.",
      "Understand aggregate product usage to prioritize improvements.",
      "Detect, prevent, and address security incidents and abuse.",
    ],
  },
  {
    heading: "Your agents, code, and keys",
    body: [
      "The local Recoder cockpit runs on your machine. Your source code, model-provider API keys, and the contents of agent sessions remain under your control. We do not require you to upload your code or your provider keys to use the local product.",
      "If you enable a team or hosted feature that synchronizes work across machines, only the coordination metadata required for that feature is transmitted, and it is used solely to deliver the feature you enabled.",
    ],
  },
  {
    heading: "Analytics and cookies",
    body: [
      "When analytics are enabled, we use a privacy-respecting analytics setup that measures aggregate traffic without building cross-site advertising profiles and without selling data to third parties. If analytics are disabled, no analytics requests are sent.",
      "We use only the cookies strictly necessary for the site to function. We do not use third-party advertising or cross-site tracking cookies.",
    ],
  },
  {
    heading: "Sharing and disclosure",
    body: [
      "We do not sell your personal data. We share information only with service providers who help us operate Recoder (such as hosting and email delivery), under contracts that limit their use of the data, and where required to comply with law or to protect our rights and users.",
    ],
  },
  {
    heading: "Data retention",
    body: [
      "We keep personal data only as long as needed for the purposes described in this policy or as required by law, after which we delete or anonymize it. Aggregate analytics are retained without identifying individual visitors.",
    ],
  },
  {
    heading: "Security",
    body: [
      "We use reasonable technical and organizational measures to protect information against unauthorized access, loss, or misuse. No system is perfectly secure, but we design Recoder to minimize the data we hold in the first place.",
    ],
  },
  {
    heading: "Your rights",
    body: [
      "Depending on where you live, you may have rights to access, correct, export, or delete your personal data, and to object to or restrict certain processing. To exercise these rights, contact us using the details below and we will respond as required by applicable law.",
    ],
  },
  {
    heading: "International transfers and children",
    body: [
      "We may process information in countries other than where you live. Where required, we use appropriate safeguards for cross-border transfers. Recoder is not directed to children, and we do not knowingly collect personal data from anyone under the age required by local law.",
    ],
  },
  {
    heading: "Changes to this policy",
    body: [
      "We may update this policy as the product evolves. When we make material changes, we will update the “Last updated” date above and, where appropriate, provide additional notice.",
    ],
  },
  {
    heading: "Contact us",
    body: [
      "Questions about this policy or your data? Email privacy@recoder.xyz and we will get back to you.",
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={UPDATED}
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}
