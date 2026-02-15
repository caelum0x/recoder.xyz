import { Container } from "@repo/design-system/components/container";
import type { HTMLAttributes } from "react";
import { Card } from "@/app/(home)/components/card";
import { FeatureHero } from "@/components/feature-hero";
import { features } from "@/lib/features";
import { ActivityGraphic } from "./components/activity-graphic";
import { DigestGraphic } from "./components/digest-graphic";
import { PresenceGraphic } from "./components/presence-graphic";
import { TrendsGraphic } from "./components/trends-graphic";

type ActivityProperties = HTMLAttributes<HTMLDivElement>;

export const Activity = (properties: ActivityProperties) => (
  <section {...properties}>
    <Container className="flex flex-col gap-8 border-x px-4 pt-16 pb-4">
      <FeatureHero {...features.activity} />
      <div className="grid gap-4 md:grid-cols-6">
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM keeps a log of all activity across your product team, from new features to portal updates."
          feature="Activity Log"
          title="Stay up to date"
        >
          <ActivityGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM takes your team's activity and summarizes it into a digestible format, so you can stay in sync."
          feature="AI-Powered Digests"
          title="What's new?"
        >
          <DigestGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Keep tabs on upcoming trends and opportunities in customer feedback."
          feature="AI Trend Analysis"
          title="Stay ahead of the curve"
        >
          <TrendsGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Get a real-time view of who's on Recoder PM and what they're working on."
          feature="Presence"
          title="See who's active"
        >
          <PresenceGraphic />
        </Card>
      </div>
    </Container>
  </section>
);
