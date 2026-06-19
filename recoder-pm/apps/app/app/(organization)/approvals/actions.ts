"use server";

import { currentUser } from "@repo/backend/auth/utils";
import { parseError } from "@repo/lib/parse-error";
import { revalidatePath } from "next/cache";

type ApprovalDecision = "approve" | "reject";

function getAgentOsBaseUrl(): string {
  const baseUrl = process.env.RECODER_AGENT_OS_API_URL ?? process.env.NEXT_PUBLIC_RECODER_API_URL;
  if (!baseUrl) {
    throw new Error("RECODER_AGENT_OS_API_URL is not configured for this PM deployment.");
  }
  return baseUrl.replace(/\/$/, "");
}

export async function decideAgentOsApproval(formData: FormData): Promise<void> {
  try {
    const approvalId = String(formData.get("approvalId") ?? "").trim();
    const decision = String(formData.get("decision") ?? "").trim() as ApprovalDecision;
    const reason = String(formData.get("reason") ?? "").trim();

    if (!approvalId) {
      throw new Error("approvalId is required.");
    }
    if (decision !== "approve" && decision !== "reject") {
      throw new Error("decision must be approve or reject.");
    }

    const user = await currentUser();
    const decidedBy = user?.id ?? user?.email ?? "recoder-pm";
    const response = await fetch(`${getAgentOsBaseUrl()}/api/agent-os/approvals/${encodeURIComponent(approvalId)}/${decision}`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        ...(process.env.RECODER_API_TOKEN
          ? { authorization: `Bearer ${process.env.RECODER_API_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        decidedBy,
        ...(reason ? { reason } : {}),
      }),
    });

    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    if (!response.ok || body?.error) {
      throw new Error(body?.error ?? `Agent OS API returned ${response.status}`);
    }

    revalidatePath("/approvals");
  } catch (error) {
    throw new Error(parseError(error));
  }
}
