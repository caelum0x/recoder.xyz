"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { handleError } from "@repo/design-system/lib/handle-error";
import { useState } from "react";
import { toast } from "sonner";
import {
  acknowledgeContradiction,
  dismissContradiction,
  reactivateContradiction,
  snoozeContradiction,
} from "../actions";

type ContradictionActionsProps = {
  readonly id: string;
  readonly status: string;
};

const snoozeDurations = [
  { label: "1d", days: 1 },
  { label: "3d", days: 3 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
] as const;

export const ContradictionActions = ({
  id,
  status,
}: ContradictionActionsProps) => {
  const [pending, setPending] = useState(false);
  const [showSnooze, setShowSnooze] = useState(false);

  const handleAction = async (
    action: () => Promise<{ success: true } | { error: string }>,
    successMessage: string
  ) => {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const result = await action();

      if ("error" in result) {
        throw new Error(result.error);
      }

      toast.success(successMessage);
      setShowSnooze(false);
    } catch (error) {
      handleError(error);
    } finally {
      setPending(false);
    }
  };

  if (status !== "active") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs capitalize">
          {status}
        </span>
        <Button
          disabled={pending}
          onClick={() =>
            handleAction(
              () => reactivateContradiction(id),
              "Contradiction reactivated."
            )
          }
          size="sm"
          variant="outline"
        >
          Reactivate
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        className="bg-green-600 text-white hover:bg-green-700"
        disabled={pending}
        onClick={() =>
          handleAction(
            () => acknowledgeContradiction(id),
            "Contradiction acknowledged."
          )
        }
        size="sm"
      >
        Acknowledge
      </Button>
      <Button
        disabled={pending}
        onClick={() =>
          handleAction(
            () => dismissContradiction(id),
            "Contradiction dismissed."
          )
        }
        size="sm"
        variant="secondary"
      >
        Dismiss
      </Button>
      <div className="relative">
        <Button
          className="bg-yellow-500 text-white hover:bg-yellow-600"
          disabled={pending}
          onClick={() => setShowSnooze((prev) => !prev)}
          size="sm"
        >
          Snooze
        </Button>
        {showSnooze ? (
          <div className="absolute top-full right-0 z-10 mt-1 flex gap-1 rounded-md border bg-background p-1 shadow-md">
            {snoozeDurations.map((option) => (
              <Button
                disabled={pending}
                key={option.days}
                onClick={() =>
                  handleAction(
                    () => snoozeContradiction(id, option.days),
                    `Snoozed for ${option.label}.`
                  )
                }
                size="sm"
                variant="ghost"
              >
                {option.label}
              </Button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
};
