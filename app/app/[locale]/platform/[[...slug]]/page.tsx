import { redirect } from "next/navigation";

// The pre-pivot "platform" suite was retired — Recoder is a desktop terminal
// for parallel coding agents. Old /platform/* deep links land on the homepage
// rather than 404ing.
export default function LegacyPlatformRedirect() {
  redirect("/");
}
