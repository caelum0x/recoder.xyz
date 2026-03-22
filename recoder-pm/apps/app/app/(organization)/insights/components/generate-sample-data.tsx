"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { toast } from "@repo/design-system/lib/toast";
import { SparklesIcon, Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { createExampleContent } from "@/actions/example-content/create";

export const GenerateSampleData = () => {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleGenerate = async () => {
    if (loading) return;
    setLoading(true);

    try {
      const result = await createExampleContent();

      if (result.error) {
        handleError(result.error);
        return;
      }

      toast.success("Sample data generated! Your dashboard is now populated.");
      router.refresh();
    } catch (error) {
      handleError(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-dashed border-muted-foreground/25 p-6 text-center">
      <SparklesIcon className="mx-auto mb-3 h-8 w-8 text-muted-foreground/50" />
      <h3 className="mb-1 font-medium text-sm">No data yet</h3>
      <p className="mb-4 text-muted-foreground text-xs">
        Generate sample features, feedback, releases, and initiatives to explore the platform.
      </p>
      <Button
        disabled={loading}
        onClick={handleGenerate}
        size="sm"
        variant="outline"
      >
        {loading ? (
          <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <SparklesIcon className="mr-2 h-4 w-4" />
        )}
        Generate sample data
      </Button>
    </div>
  );
};
