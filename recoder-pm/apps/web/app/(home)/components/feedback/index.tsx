import { Container } from "@repo/design-system/components/container";
import type { HTMLAttributes } from "react";
import { Card } from "@/app/(home)/components/card";
import { FeatureHero } from "@/components/feature-hero";
import { features } from "@/lib/features";
import { InsightsGraphic } from "../insights/insights-graphic";
import { MediaFeedbackGraphic } from "./components/media-feedback-graphic";
import { SentimentGraphic } from "./components/sentiment-graphic";
import { SummarizeGraphic } from "./components/summarize-graphic";
import { TagsGraphic } from "./components/tags-graphic";
import { TranscriptionGraphic } from "./components/transcription-graphic";

type FeedbackProperties = HTMLAttributes<HTMLDivElement>;

export const Feedback = (properties: FeedbackProperties) => (
  <section {...properties}>
    <Container className="flex flex-col gap-8 border-x px-4 pt-16 pb-4">
      <FeatureHero {...features.feedback} />
      <div className="grid gap-4 md:grid-cols-6">
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM summarizes feedback, extracting pain points, recommendations and desired outcomes, to help clarify what your customers want."
          feature="AI Feedback Summarization"
          title="Understand the voice of the customer"
        >
          <SummarizeGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM automatically tags phrases and insights in feedback into key categories, so you can focus on what matters."
          feature="AI Triage and Tagging"
          title="Stop processing feedback manually"
        >
          <TagsGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Source feedback from popular support tools and use automated sentiment analysis to understand how your customers feel."
          feature="AI Sentiment Analysis"
          title="Empathize with your customers"
        >
          <SentimentGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM can process video and audio feedback, so you can understand your customers in their own words."
          feature="Video and Audio Feedback"
          title="Drop anything into Recoder PM"
        >
          <MediaFeedbackGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM transcribes audio and video feedback, so you can triage it alongside your text feedback."
          feature="AI Transcription"
          title="Understand feedback in any format"
        >
          <TranscriptionGraphic />
        </Card>
        <Card
          className="h-full md:col-span-3"
          description="Recoder PM synthesizes insights across feedback, analytics, support tickets and session recordings to surface patterns you would never find manually."
          feature="AI Cross-Data Insights"
          title="See the full picture"
        >
          <InsightsGraphic />
        </Card>
      </div>
    </Container>
  </section>
);
