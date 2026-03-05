import { redirect } from "next/navigation";
import { getSessionUserOrNull } from "@/lib/auth/server";

export default async function RootPage() {
	const sessionUser = await getSessionUserOrNull();
	redirect(sessionUser ? "/dashboard" : "/login");
}
