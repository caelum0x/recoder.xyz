import type { Metadata } from "next";
import { LegalPage, type LegalSection } from "../legal/legal-page";

const UPDATED = "2026-06-28";

export const metadata: Metadata = {
  title: "Terms of Service — Recoder",
  description:
    "The terms that govern your use of Recoder, the control plane that coordinates the coding agents you already run.",
  alternates: { canonical: "https://recoder.xyz/terms" },
};

const INTRO =
  "These Terms of Service (“Terms”) govern your access to and use of the Recoder website, downloads, and services (collectively, the “Service”). By using the Service, you agree to these Terms. If you do not agree, do not use the Service.";

const SECTIONS: LegalSection[] = [
  {
    heading: "The Service",
    body: [
      "Recoder is a control plane that coordinates the coding agents you already run, using your own model-provider keys. Recoder does not provide the underlying language models and does not resell inference. You are responsible for your agents, your keys, and the model providers you choose to use.",
    ],
  },
  {
    heading: "Eligibility and accounts",
    body: [
      "You must be able to form a binding contract to use the Service. If you create an account or submit information on behalf of an organization, you represent that you are authorized to bind that organization to these Terms.",
      "You are responsible for maintaining the confidentiality of any credentials and for all activity that occurs under your account.",
    ],
  },
  {
    heading: "Acceptable use",
    body: [
      "You agree to use the Service lawfully and not to misuse it. The following are prohibited:",
    ],
    bullets: [
      "Violating any applicable law or the rights of others.",
      "Attempting to gain unauthorized access to the Service, other accounts, or related systems.",
      "Interfering with or disrupting the integrity or performance of the Service.",
      "Reverse engineering or circumventing security or access controls except as permitted by law.",
      "Using the Service to build, train, or operate agents that perform illegal or abusive activity.",
    ],
  },
  {
    heading: "Your content and agents",
    body: [
      "You retain all rights to your source code, prompts, agent configurations, and provider keys (“Your Content”). The local Recoder cockpit runs on your machine; you are responsible for Your Content and for complying with the terms of any model provider or third-party service you connect.",
      "You grant us only the limited rights necessary to operate features you explicitly enable — for example, to synchronize coordination metadata for a team feature you turn on.",
    ],
  },
  {
    heading: "Third-party services",
    body: [
      "The Service may interoperate with third-party tools and model providers. Your use of those services is governed by their own terms, and we are not responsible for them. You are responsible for any fees those providers charge, including inference costs billed to your own keys.",
    ],
  },
  {
    heading: "Fees",
    body: [
      "Some features are free and others are paid. If you purchase a paid plan, you agree to the pricing and billing terms presented at the time of purchase. Recoder charges for the coordination layer, not for model inference; inference is billed to you directly by your providers.",
    ],
  },
  {
    heading: "Intellectual property",
    body: [
      "The Service, including its software, design, and trademarks, is owned by Recoder and its licensors and is protected by intellectual-property laws. Except for the rights expressly granted to you, we reserve all rights in the Service.",
    ],
  },
  {
    heading: "Disclaimer of warranties",
    body: [
      "The Service is provided “as is” and “as available,” without warranties of any kind, whether express, implied, or statutory, including warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or secure.",
    ],
  },
  {
    heading: "Limitation of liability",
    body: [
      "To the maximum extent permitted by law, Recoder will not be liable for any indirect, incidental, special, consequential, or punitive damages, or for any loss of profits, data, or goodwill, arising out of or related to your use of the Service. Our total liability for any claim relating to the Service will not exceed the greater of the amounts you paid us in the twelve months before the claim or one hundred US dollars.",
    ],
  },
  {
    heading: "Indemnification",
    body: [
      "You agree to indemnify and hold harmless Recoder from claims, damages, and expenses arising out of your use of the Service, Your Content, or your violation of these Terms or applicable law.",
    ],
  },
  {
    heading: "Termination",
    body: [
      "You may stop using the Service at any time. We may suspend or terminate access if you violate these Terms or to protect the Service or its users. Provisions that by their nature should survive termination — including ownership, disclaimers, and limitations of liability — will survive.",
    ],
  },
  {
    heading: "Changes to these Terms",
    body: [
      "We may update these Terms as the Service evolves. When we make material changes, we will update the “Last updated” date above and, where appropriate, provide additional notice. Your continued use of the Service after changes take effect constitutes acceptance of the updated Terms.",
    ],
  },
  {
    heading: "Governing law",
    body: [
      "These Terms are governed by applicable law without regard to conflict-of-laws principles. Disputes will be resolved in the courts having jurisdiction over Recoder, except where local law grants you a non-waivable right to a different venue.",
    ],
  },
  {
    heading: "Contact us",
    body: [
      "Questions about these Terms? Email legal@recoder.xyz and we will get back to you.",
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={UPDATED}
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}
