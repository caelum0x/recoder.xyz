import { currentOrganizationId, currentUser } from "@repo/backend/auth/utils";
import { formatDate } from "@repo/lib/format";
import { createMetadata } from "@repo/seo/metadata";
import { ClipboardIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { database } from "@/lib/database";
import { CreateInterviewDialog } from "./components/create-interview-dialog";

const title = "Interviews";
export const dynamic = "force-dynamic";
const description = "Collect and analyze interview transcripts.";

export const metadata: Metadata = createMetadata({ title, description });

const InterviewsPage = async () => {
  const [user, organizationId] = await Promise.all([
    currentUser(),
    currentOrganizationId(),
  ]);

  if (!(user && organizationId)) {
    notFound();
  }

  const interviews = await database.interview.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      createdAt: true,
      analysis: true,
    },
  });

  return (
    <div className="px-6 py-16">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-3">
          <div className="grid gap-2">
            <h1 className="m-0 font-semibold text-4xl tracking-tight">
              {title}
            </h1>
            <p className="text-muted-foreground">{description}</p>
          </div>
          <CreateInterviewDialog />
        </div>
        {interviews.length === 0 ? (
          <div className="mt-12 flex flex-1 items-center justify-center">
            <EmptyState
              description="Add your first interview transcript to start extracting insights."
              icon={ClipboardIcon}
              title="No interviews yet"
            />
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {interviews.map((interview) => (
              <Link
                className="rounded-lg border bg-background p-4 transition hover:border-foreground/20"
                href={`/interviews/${interview.id}`}
                key={interview.id}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <h2 className="font-semibold text-lg">{interview.title}</h2>
                    <p className="text-muted-foreground text-sm">
                      {formatDate(interview.createdAt)}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground text-xs">
                    {interview.analysis ? "Analyzed" : "Analyzing"}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default InterviewsPage;
