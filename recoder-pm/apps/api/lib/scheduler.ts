import { type ScheduledTask, startScheduler } from "@repo/scheduler";

const tasks: ScheduledTask[] = [
  {
    name: "atlassian-token",
    schedule: "*/10 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/atlassian/token/route");
      await GET();
    },
  },
  {
    name: "atlassian-webhook",
    schedule: "*/10 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/atlassian/webhook/route");
      await GET();
    },
  },
  {
    name: "digest",
    schedule: "*/10 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/digest/route");
      await GET();
    },
  },
  {
    name: "analytics-sync",
    schedule: "*/30 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/analytics/sync/route");
      await GET();
    },
  },
  {
    name: "ai-insights",
    schedule: "0 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/ai-insights/route");
      await GET();
    },
  },
  {
    name: "data-health",
    schedule: "0 9 * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/data-health/route");
      await GET();
    },
  },
  {
    name: "opportunity-scoring",
    schedule: "15 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/opportunity-scoring/route");
      await GET();
    },
  },
  {
    name: "proposals",
    schedule: "30 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/proposals/route");
      await GET();
    },
  },
  {
    name: "contradictions",
    schedule: "45 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/contradictions/route");
      await GET();
    },
  },
  {
    name: "import",
    schedule: "*/10 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/import/route");
      await GET();
    },
  },
  {
    name: "support-tickets",
    schedule: "*/30 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/support-tickets/route");
      await GET();
    },
  },
  {
    name: "session-recordings",
    schedule: "*/30 * * * *",
    handler: async () => {
      const { GET } = await import("@/app/cron/session-recordings/route");
      await GET();
    },
  },
];

export const registerScheduler = () => {
  const enabled = !process.env.VERCEL && process.env.NEXT_RUNTIME !== "edge";

  startScheduler(tasks, { enabled });
};
