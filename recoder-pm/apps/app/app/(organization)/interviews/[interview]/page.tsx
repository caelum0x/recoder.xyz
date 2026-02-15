import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { contentToText } from "@repo/editor/lib/tiptap";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { database } from "@/lib/database";

type InterviewAnalysis = {
  summary?: string;
  themes?: string[];
  painPoints?: string[];
  featureRequests?: string[];
};

export const metadata: Metadata = createMetadata({
  title: "Interview",
  description: "Interview details and AI analysis.",
});

const InterviewPage = async ({
  params,
}: {
  readonly params: { interview: string };
}) => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    notFound();
  }

  const interview = await database.interview.findFirst({
    where: {
      id: params.interview,
      organizationId,
    },
    select: {
      id: true,
      title: true,
      createdAt: true,
      transcript: true,
      audioUrl: true,
      transcribedAt: true,
      analysis: true,
    },
  });

  if (!interview) {
    notFound();
  }

  const transcriptText = contentToText(interview.transcript);
  const analysis = (interview.analysis ?? {}) as InterviewAnalysis;

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl space-y-8">
        <div className="space-y-2">
          <Link className="text-muted-foreground text-sm" href="/interviews">
            ← Back to interviews
          </Link>
          <h1 className="m-0 font-semibold text-4xl tracking-tight">
            {interview.title}
          </h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(interview.createdAt)}
          </p>
        </div>

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">Transcript</h2>
          <p className="mt-4 whitespace-pre-wrap text-foreground/90 text-sm">
            {transcriptText}
          </p>
          {interview.audioUrl ? (
            <p className="mt-4 text-muted-foreground text-sm">
              Audio source:{" "}
              <a
                className="underline underline-offset-4"
                href={interview.audioUrl}
                rel="noreferrer"
                target="_blank"
              >
                {interview.audioUrl}
              </a>
            </p>
          ) : null}
          {!analysis.summary &&
          interview.audioUrl &&
          !interview.transcribedAt ? (
            <p className="mt-2 text-muted-foreground text-xs">
              Transcription in progress.
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border bg-background p-6">
          <h2 className="font-semibold text-lg">AI Analysis</h2>
          {analysis.summary ? (
            <p className="mt-4 text-foreground/90 text-sm">
              {analysis.summary}
            </p>
          ) : (
            <p className="mt-4 text-muted-foreground text-sm">
              Analysis is still processing.
            </p>
          )}
          {analysis.themes?.length ? (
            <div className="mt-6">
              <h3 className="font-medium">Themes</h3>
              <ul className="mt-2 list-disc pl-5 text-foreground/90 text-sm">
                {analysis.themes.map((theme) => (
                  <li key={theme}>{theme}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {analysis.painPoints?.length ? (
            <div className="mt-6">
              <h3 className="font-medium">Pain Points</h3>
              <ul className="mt-2 list-disc pl-5 text-foreground/90 text-sm">
                {analysis.painPoints.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {analysis.featureRequests?.length ? (
            <div className="mt-6">
              <h3 className="font-medium">Feature Requests</h3>
              <ul className="mt-2 list-disc pl-5 text-foreground/90 text-sm">
                {analysis.featureRequests.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default InterviewPage;
