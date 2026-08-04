import { redirect } from "next/navigation";

// The cloud-era dashboard suite was retired in the desktop pivot — account
// state now lives on the single /account page. Old /dashboard/* deep links
// land there rather than 404ing (same stub pattern as /docs and /platform).
export default function LegacyDashboardRedirect() {
  redirect("/account");
}
