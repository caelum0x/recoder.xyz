import { NextResponse } from "next/server";
import {
  assembleSampleEvidence,
  loadEvidenceSigningKey,
  parseDiff,
  parseVerificationOutput,
  renderSampleExport,
  signSampleExport,
  verifyExportHash,
  verifySampleSignature,
} from "./engine";
import {
  clientIpFrom,
  MAX_DIFF_CHARS,
  MAX_TASK_DESCRIPTION_CHARS,
  MAX_VERIFICATION_CHARS,
  takeRateLimitToken,
} from "./guards";

// Run on the Node.js runtime — we use node:crypto for Ed25519 signing.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EvidenceSampleBody {
  diff?: unknown;
  verificationOutput?: unknown;
  taskDescription?: unknown;
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!takeRateLimitToken(clientIpFrom(request.headers), Date.now())) {
    return NextResponse.json(
      { success: false, error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }

  let body: EvidenceSampleBody;
  try {
    body = (await request.json()) as EvidenceSampleBody;
  } catch {
    return NextResponse.json({ success: false, error: "Invalid JSON body." }, { status: 400 });
  }

  const diffText = typeof body.diff === "string" ? body.diff : "";
  const verificationText = typeof body.verificationOutput === "string" ? body.verificationOutput : "";
  const taskDescription = typeof body.taskDescription === "string" ? body.taskDescription.slice(0, MAX_TASK_DESCRIPTION_CHARS) : undefined;

  if (!diffText.trim()) {
    return NextResponse.json({ success: false, error: "Paste a diff first — this needs a real `git diff` / PR diff to analyze." }, { status: 400 });
  }
  if (diffText.length > MAX_DIFF_CHARS) {
    return NextResponse.json({ success: false, error: `The diff is too large (${diffText.length} chars). Max is ${MAX_DIFF_CHARS.toLocaleString()} chars — paste the diff for one PR, not a full repo export.` }, { status: 400 });
  }
  if (verificationText.length > MAX_VERIFICATION_CHARS) {
    return NextResponse.json({ success: false, error: `The verification output is too large (${verificationText.length} chars). Max is ${MAX_VERIFICATION_CHARS.toLocaleString()} chars.` }, { status: 400 });
  }

  const diff = parseDiff(diffText);
  if (!diff.looksLikeDiff) {
    return NextResponse.json(
      { success: false, error: "That doesn't look like a unified diff — paste the output of `git diff` or a PR's \"Files changed\" diff, including the @@ hunk markers." },
      { status: 400 },
    );
  }

  const verification = parseVerificationOutput(verificationText);

  const record = assembleSampleEvidence({ diff, verification, taskDescription });
  let pack = renderSampleExport(record);

  const privateKey = loadEvidenceSigningKey(process.env.EVIDENCE_SIGNING_KEY);
  pack = signSampleExport(pack, privateKey);

  const integrity = {
    recordHashVerified: pack.evidenceIntegrity.verified,
    exportHashVerified: verifyExportHash(pack),
    signature: verifySampleSignature(pack),
  };

  return NextResponse.json(
    {
      success: true,
      disclaimer:
        "This is a SAMPLE generated from the diff and output you pasted, outside of a governed Recoder run — it is not a certification of your code, and it carries no audit-chain seal. It demonstrates exactly what Recoder emits automatically after every real agent merge.",
      input: {
        changedFiles: diff.changedFiles.length,
        insertions: diff.insertions,
        deletions: diff.deletions,
        riskTier: record.governance.riskTier,
        verificationVerdict: verification.verdict,
      },
      record,
      export: pack,
      integrity,
    },
    { status: 200 },
  );
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json(
    {
      success: false,
      error: "POST a { diff, verificationOutput } body to generate a sample evidence record.",
    },
    { status: 405 },
  );
}
