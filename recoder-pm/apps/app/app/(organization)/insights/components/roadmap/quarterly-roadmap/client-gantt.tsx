"use client";

import type { User } from "@repo/backend/auth";
import type { GanttFeature } from "@repo/design-system/components/kibo-ui/gantt";
import dynamic from "next/dynamic";

const QuarterlyRoadmapGantt = dynamic(
  () => import("./gantt").then((mod) => mod.QuarterlyRoadmapGantt),
  { ssr: false }
);

type QuarterlyRoadmapClientGanttProps = {
  readonly groups: Record<string, (GanttFeature & { ownerId: string })[]>;
  readonly members: User[];
};

export const QuarterlyRoadmapClientGantt = (
  props: QuarterlyRoadmapClientGanttProps
) => <QuarterlyRoadmapGantt {...props} />;
