import { redirect } from "next/navigation";

// The mobile companion-app page was retired in the desktop pivot.
// Old /mobile links land on the desktop download page rather than 404ing.
export default function LegacyMobileRedirect() {
  redirect("/download");
}
