import { redirect } from "next/navigation";

// The legacy /cli/authorize surface (Set B device flow) was retired — the
// canonical device-authorize page is /cli/auth, backed by /api/auth/cli/*.
// Old links keep working and carry the ?code= prefill through.
export default async function LegacyCliAuthorizeRedirect({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  redirect(code ? `/cli/auth?code=${encodeURIComponent(code)}` : "/cli/auth");
}
