"use client";

import { PmEvents, trackPmEvent } from "@/lib/analytics";
import { useEffect } from "react";

export const TrackInsightsView = () => {
  useEffect(() => {
    trackPmEvent(PmEvents.INSIGHTS_VIEWED, {
      pagePath: "/insights",
      pageTitle: "Insights",
    });
  }, []);

  return null;
};
