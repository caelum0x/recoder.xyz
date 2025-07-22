/**
 * Common types and enums
 */
export declare enum ProjectType {
    WEB = "web",
    MOBILE = "mobile",
    BLOCKCHAIN = "blockchain",
    AI = "ai",
    BACKEND = "backend",
    DESKTOP = "desktop",
    MICROSERVICE = "microservice",
    FULLSTACK = "fullstack"
}
export declare enum Environment {
    DEVELOPMENT = "development",
    STAGING = "staging",
    PRODUCTION = "production",
    TEST = "test"
}
export declare enum CodeQuality {
    PRODUCTION = "production",
    PROTOTYPE = "prototype",
    ENTERPRISE = "enterprise",
    MINIMAL = "minimal"
}
export declare enum IntegrationType {
    DATABASE = "database",
    API = "api",
    PAYMENT = "payment",
    AUTH = "auth",
    STORAGE = "storage",
    MESSAGING = "messaging",
    BLOCKCHAIN = "blockchain",
    AI_ML = "ai_ml",
    ANALYTICS = "analytics",
    CDN = "cdn"
}
export declare enum ValidationLevel {
    BASIC = "basic",
    INTERMEDIATE = "intermediate",
    STRICT = "strict",
    ENTERPRISE = "enterprise"
}
export interface Timestamp {
    createdAt: string;
    updatedAt: string;
    deletedAt?: string;
}
export interface Pagination {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}
export interface SortOptions {
    field: string;
    order: 'asc' | 'desc';
}
export interface FilterOptions {
    [key: string]: any;
}
export interface SearchOptions {
    query?: string;
    filters?: FilterOptions;
    sort?: SortOptions;
    pagination?: Partial<Pagination>;
}
export interface RealityCheckConfig {
    /** Prevent mock/placeholder patterns */
    preventMockPatterns: boolean;
    /** Require real service integrations */
    requireRealIntegrations: boolean;
    /** Validate external dependencies */
    validateDependencies: boolean;
    /** Check for production readiness */
    enforceProductionStandards: boolean;
    /** Minimum test coverage required */
    minimumTestCoverage: number;
    /** Security validation level */
    securityLevel: ValidationLevel;
}
//# sourceMappingURL=common.d.ts.map