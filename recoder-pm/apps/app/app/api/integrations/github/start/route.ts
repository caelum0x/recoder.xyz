import { NextResponse } from "next/server";
import { env } from "@/env";

export const GET = (): Response => {
  const githubAppSlug = env.GITHUB_APP_SLUG;
  if (!githubAppSlug || githubAppSlug === "your-github-app-slug" || githubAppSlug === "placeholder") {
    return NextResponse.json(
      { error: "GitHub integration is not configured. Set GITHUB_APP_SLUG in environment." },
      { status: 503 }
    );
  }
  return NextResponse.redirect(
    `https://github.com/apps/${githubAppSlug}/installations/new`
  );
};
