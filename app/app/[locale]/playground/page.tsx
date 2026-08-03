import { redirect } from "next/navigation";

// The playground exposed internal device-flow tooling as a product page —
// retired in the desktop pivot. Old links land on the homepage.
export default function LegacyPlaygroundRedirect() {
  redirect("/");
}
