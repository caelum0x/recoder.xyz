import { redirect } from "next/navigation";

// The localized docs tree was retired in the desktop pivot — canonical docs
// live on the marketing site at /docs (nginx routes it to recoder-site).
// Old /en/docs/* deep links land on the docs index rather than 404ing.
export default function LegacyDocsRedirect() {
  redirect("/docs");
}
