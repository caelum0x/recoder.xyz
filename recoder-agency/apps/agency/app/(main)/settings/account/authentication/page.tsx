import { redirect } from "next/navigation";

// Authentication is handled by recoder.xyz (Better Auth).
// This page is no longer needed — redirect to account settings.
export default function AccountAuthenticationPage() {
	redirect("/settings/account");
}
