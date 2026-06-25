/** A row of desktop activity recalled from continuum (ts/continuum). */
export interface BrainActivity {
  /** When it happened (ISO string or continuum's own timestamp). */
  when: string;
  /** The app the activity occurred in. */
  app: string;
  /** Who acted: the user, others, or the system. */
  who: "you" | "others" | "system";
  /** Activity kind (message, edit, view, etc.). */
  type: string;
  /** The activity text/content. */
  text: string;
  /** Stable id for the row. */
  id: string;
}

/** A synthesized profile of how the user works, from continuum's profile(). */
export interface BrainActivityProfile {
  /** Profile kind/category. */
  kind: string;
  /** Short synthesized summary of who the user is / how they work. */
  brief?: string;
  /** Apps the user works in. */
  apps: string[];
  /** Tools/types the user engages with. */
  tools: string[];
  /** Recurring patterns/habits. */
  recurring: string[];
}
