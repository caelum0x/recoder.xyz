"use client";

import { AccountDeletionWorkflow } from "@/components/settings/account-deletion-workflow";
import { useAuth } from "@/lib/auth/auth-context";
import { useEffect } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";

export default function AccountDeletionPage() {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!user && !loading) {
      redirect("/login");
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header with back link */}
        <div className="mb-8">
          <Link
            href="/settings/account"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
          >
            ← Back to Account Settings
          </Link>
        </div>

        {/* Account Deletion Workflow */}
        <AccountDeletionWorkflow />
      </div>
    </div>
  );
}

export const runtime = "edge";
