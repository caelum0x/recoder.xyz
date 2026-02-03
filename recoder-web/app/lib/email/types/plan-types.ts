/**
 * Plan types for email templates
 */
export const PLAN_TYPES = {
  FREE: 'recoder free',
  PRO: 'recoder pro',
  MAX: 'recoder max',
} as const;

/**
 * Plan type union type
 */
export type PlanType = typeof PLAN_TYPES[keyof typeof PLAN_TYPES];

/**
 * Plan benefits interface for email templates
 */
export interface PlanBenefits {
  /**
   * List of features for the plan
   */
  features: string[];

  /**
   * Marketing description for the plan
   */
  description: string;

  /**
   * Call to action text
   */
  ctaText: string;

  /**
   * Welcome message
   */
  welcomeMessage: string;
}

/**
 * Plan configuration interface for email templates
 */
export interface PlanConfig {
  /**
   * Plan benefits
   */
  benefits: PlanBenefits;

  /**
   * Plan price information
   */
  pricing: {
    /**
     * Monthly price
     */
    monthly: number;

    /**
     * Yearly price
     */
    yearly: number;

    /**
     * Currency
     */
    currency: string;
  };

  /**
   * Plan limits
   */
  limits: {
    /**
     * Number of projects
     */
    projects: number;

    /**
     * Number of AI messages
     */
    aiMessages: number;

    /**
     * Number of team seats
     */
    seats: number;
  };
}

/**
 * Plan configuration map
 */
export type PlanConfigMap = Record<PlanType, PlanConfig>;
