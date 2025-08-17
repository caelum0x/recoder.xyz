/**
 * Analytics Engine
 */

export interface AnalyticsEvent {
  name: string;
  properties: Record<string, any>;
  timestamp: Date;
}

export class AnalyticsEngine {
  private static instance: AnalyticsEngine;
  private events: AnalyticsEvent[] = [];

  static getInstance(): AnalyticsEngine {
    if (!AnalyticsEngine.instance) {
      AnalyticsEngine.instance = new AnalyticsEngine();
    }
    return AnalyticsEngine.instance;
  }

  track(name: string, properties: Record<string, any> = {}): void {
    this.events.push({
      name,
      properties,
      timestamp: new Date()
    });
  }

  getEvents(): AnalyticsEvent[] {
    return this.events;
  }

  flush(): void {
    this.events = [];
  }

  trackCodeGeneration(data: any): void {
    this.track('code_generation', data);
  }
}

export const analyticsEngine = AnalyticsEngine.getInstance();