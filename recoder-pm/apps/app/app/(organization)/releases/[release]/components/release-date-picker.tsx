"use client";

import type { Release } from "@repo/backend/prisma/client";
import {
  Calendar,
  type DateRange,
} from "@repo/design-system/components/precomposed/calendar";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@repo/design-system/components/ui/popover";
import { handleError } from "@repo/design-system/lib/handle-error";
import { cn } from "@repo/design-system/lib/utils";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
import { updateRelease } from "@/actions/release/update";

type ReleaseDatePickerProps = {
  releaseId: Release["id"];
  defaultStartAt: Release["startAt"] | null;
  defaultEndAt: Release["endAt"] | null;
  disabled?: boolean;
};

export const ReleaseDatePicker = ({
  releaseId,
  defaultStartAt,
  defaultEndAt,
  disabled,
}: ReleaseDatePickerProps) => {
  const [date, setDate] = useState<DateRange | undefined>({
    from: defaultStartAt ?? undefined,
    to: defaultEndAt ?? undefined,
  });

  const handleDateChange = async (newDate: DateRange | undefined) => {
    setDate(newDate);

    try {
      const response = await updateRelease(releaseId, {
        startAt: newDate?.from,
        endAt: newDate?.to,
      });

      if (response.error) {
        throw new Error(response.error);
      }
    } catch (error) {
      handleError(error);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            "flex w-full items-center justify-start gap-2 text-left font-normal",
            !date && "text-muted-foreground"
          )}
          disabled={disabled}
          id="date"
          variant="outline"
        >
          <CalendarIcon size={16} />
          {(() => {
            if (!date?.from) {
              return <span>Pick a date</span>;
            }
            if (date.to) {
              return (
                <>
                  {format(date.from, "LLL dd, y")} to{" "}
                  {format(date.to, "LLL dd, y")}
                </>
              );
            }
            return format(date.from, "LLL dd, y");
          })()}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0"
        collisionPadding={12}
      >
        <Calendar
          defaultMonth={date?.from}
          initialFocus
          mode="range"
          numberOfMonths={2}
          onSelect={handleDateChange}
          selected={date}
        />
      </PopoverContent>
    </Popover>
  );
};
